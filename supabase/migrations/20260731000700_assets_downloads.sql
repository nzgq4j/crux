-- Block 13 — Assets and downloads (§45.1.10)
-- Storage buckets with recorded visibility, asset metadata and versions, the
-- per-asset download policy, the entitlement model, and the append-only download
-- history that every signed-URL issuance writes to.
--
-- Seven tables, all in the `assets` schema (created in Block 04):
--   buckets, assets, asset_versions, content_asset_usages,
--   download_policies, download_entitlements, download_events.
--
-- The central invariant of this block: an object in a private bucket has no public
-- read path. It is enforced three times, declaratively —
--   1. assets.buckets.allows_public_read must equal (visibility = 'public');
--   2. assets.assets carries a mirrored bucket_visibility, held honest by a
--      composite foreign key, and a CHECK forbidding is_publicly_readable on a
--      private bucket;
--   3. assets.download_policies mirrors the asset's bucket visibility the same way
--      and forbids a 'public' policy over a private asset.
-- Flipping a bucket from public to private cascades down both chains and is
-- rejected outright if it would strand a publicly readable object.
--
-- Reverse procedure (destructive; never run against production):
--   DROP TABLE IF EXISTS assets.download_events, assets.download_entitlements,
--                        assets.download_policies, assets.content_asset_usages,
--                        assets.asset_versions, assets.assets, assets.buckets CASCADE;
--   DROP FUNCTION IF EXISTS private.reject_download_event_mutation(),
--                           private.sync_asset_bucket_visibility(),
--                           private.sync_policy_bucket_visibility(),
--                           private.enforce_asset_version_immutability(),
--                           private.enforce_asset_usage_immutability(),
--                           private.guard_restricted_licence_usage(),
--                           private.asset_alt_text_ok(uuid),
--                           private.content_version_alt_text_ok(uuid);
-- The `assets` schema itself is owned by Block 04 and is not dropped here.

-- ---------------------------------------------------------------------------
-- assets.buckets — the registry of the five storage buckets (§45.1.10).
-- Block 04 declares the intended visibility; this table is the authoritative
-- record of it, and everything downstream reads visibility from here rather than
-- restating it. Natural text primary key, matching the registry-table convention
-- already used by identity.roles and cms.content_types: the key IS the Supabase
-- Storage bucket name, so a surrogate id would only add an indirection.
-- ---------------------------------------------------------------------------
CREATE TABLE assets.buckets (
  key                       text PRIMARY KEY
    CHECK (key IN ('public-images', 'avatars', 'private-reports', 'datasets', 'quarantine')),
  visibility                text NOT NULL CHECK (visibility IN ('public', 'private')),
  description               text NOT NULL,
  -- Redundant with visibility on purpose: it is the column application code and
  -- storage-policy generators read, and the CHECK makes the two inseparable.
  allows_public_read        boolean NOT NULL,
  -- Private buckets are reachable only through a short-lived signed URL issued by
  -- the trusted server layer (§45.1.10 FR10).
  signed_url_only           boolean NOT NULL,
  -- Uploads land in quarantine and are promoted only after validation passes.
  is_quarantine             boolean NOT NULL DEFAULT false,
  -- Per-bucket upload limits; the server-side validator reads these (FR3).
  max_object_bytes          bigint NOT NULL CHECK (max_object_bytes > 0),
  allowed_mime_types        text[] NOT NULL DEFAULT '{}',
  -- FR14: restricted content is absent from sitemaps, feeds and public search.
  excluded_from_public_index boolean NOT NULL DEFAULT true,
  -- Retention for objects that never left quarantine (Data Requirements).
  orphan_retention_days     integer CHECK (orphan_retention_days IS NULL OR orphan_retention_days > 0),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  -- Target for the composite foreign key that mirrors visibility onto assets.
  UNIQUE (key, visibility),
  CONSTRAINT bucket_public_read_matches_visibility
    CHECK (allows_public_read = (visibility = 'public')),
  CONSTRAINT bucket_private_is_signed_url_only
    CHECK (visibility = 'public' OR signed_url_only),
  CONSTRAINT bucket_public_is_not_signed_url_only
    CHECK (visibility = 'private' OR NOT signed_url_only),
  CONSTRAINT bucket_private_is_never_indexed
    CHECK (visibility = 'public' OR excluded_from_public_index),
  CONSTRAINT quarantine_bucket_is_private
    CHECK (NOT is_quarantine OR visibility = 'private')
);

COMMENT ON TABLE assets.buckets IS
  'Registry of the five storage buckets with their recorded visibility (§45.1.10). Authoritative source of bucket visibility for every downstream check.';
COMMENT ON COLUMN assets.buckets.allows_public_read IS
  'Always equals (visibility = ''public''), enforced by CHECK. A private bucket can never be granted a public read path.';
COMMENT ON COLUMN assets.buckets.orphan_retention_days IS
  'Retention for objects that never passed validation. The scheduled quarantine cleanup job reads this; NULL means no automatic purge.';

CREATE INDEX buckets_visibility_idx ON assets.buckets (visibility);

-- The five buckets, exactly (§45.1.10). Deterministic and idempotent (rules/database.md 25).
INSERT INTO assets.buckets (
  key, visibility, description, allows_public_read, signed_url_only, is_quarantine,
  max_object_bytes, allowed_mime_types, excluded_from_public_index, orphan_retention_days
) VALUES
  ('public-images', 'public',
   'Published images and open assets. Public read of published assets only.',
   true, false, false, 20971520,
   ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'],
   false, NULL),
  ('avatars', 'public',
   'Profile pictures and expert portraits. Public read.',
   true, false, false, 5242880,
   ARRAY['image/jpeg', 'image/png', 'image/webp'],
   false, NULL),
  ('private-reports', 'private',
   'Gated reports and white papers. No direct read; short-lived signed URL only.',
   false, true, false, 209715200,
   ARRAY['application/pdf', 'application/epub+zip'],
   true, NULL),
  ('datasets', 'private',
   'Dataset files, private by default with classification recorded per dataset.',
   false, true, false, 1073741824,
   ARRAY['text/csv', 'application/json', 'application/x-parquet', 'application/zip',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
   true, NULL),
  ('quarantine', 'private',
   'Uploads pending validation. Readable only by the server-side validation pipeline.',
   false, true, true, 1073741824,
   ARRAY[]::text[],
   true, 7)
ON CONFLICT (key) DO UPDATE SET
  visibility                 = EXCLUDED.visibility,
  description                = EXCLUDED.description,
  allows_public_read         = EXCLUDED.allows_public_read,
  signed_url_only            = EXCLUDED.signed_url_only,
  is_quarantine              = EXCLUDED.is_quarantine,
  max_object_bytes           = EXCLUDED.max_object_bytes,
  allowed_mime_types         = EXCLUDED.allowed_mime_types,
  excluded_from_public_index = EXCLUDED.excluded_from_public_index,
  orphan_retention_days      = EXCLUDED.orphan_retention_days;

-- ---------------------------------------------------------------------------
-- assets.assets — the stable asset entity and its metadata (§45.1.10 FR2).
-- The mutable editorial record: licensing, alternative text, archive state, and
-- the pointer to the current version. Published content never references this
-- row's current_version_id; it references an assets.asset_versions row directly.
-- ---------------------------------------------------------------------------
CREATE TABLE assets.assets (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Normalised original filename, kept for display and for the download's
  -- content-disposition. Never used as a storage path (Security Requirements).
  filename              text NOT NULL CHECK (length(btrim(filename)) > 0),
  -- Server-generated object path. Opaque, unguessable, and unrelated to filename.
  storage_path          text NOT NULL CHECK (length(btrim(storage_path)) > 0),
  bucket_key            text NOT NULL,
  -- Mirror of the bucket's visibility. Not user-supplied: filled by
  -- private.sync_asset_bucket_visibility() and held honest by the composite FK
  -- below, which also cascades a bucket visibility change down to every asset.
  bucket_visibility     text NOT NULL CHECK (bucket_visibility IN ('public', 'private')),
  asset_class           text NOT NULL DEFAULT 'other'
    CHECK (asset_class IN ('image', 'avatar', 'document', 'dataset', 'video',
                           'audio', 'archive', 'other')),

  -- Validation (FR3, FR4). The declared type is untrusted; detected_mime comes
  -- from the file signature, computed server-side.
  declared_mime         text NOT NULL
    CHECK (declared_mime ~ '^[a-zA-Z0-9!#$&^_.+-]+/[a-zA-Z0-9!#$&^_.+-]+$'),
  detected_mime         text
    CHECK (detected_mime IS NULL OR detected_mime ~ '^[a-zA-Z0-9!#$&^_.+-]+/[a-zA-Z0-9!#$&^_.+-]+$'),
  byte_size             bigint NOT NULL CHECK (byte_size > 0),
  checksum_sha256       text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  width                 integer CHECK (width IS NULL OR width > 0),
  height                integer CHECK (height IS NULL OR height > 0),
  validation_state      text NOT NULL DEFAULT 'pending'
    CHECK (validation_state IN ('pending', 'passed', 'failed', 'promoted', 'rejected')),
  validation_notes      text,
  -- SVG and other active-content formats are either rejected or sanitised before
  -- promotion, and which was chosen is recorded (Security Requirements).
  active_content_disposition text NOT NULL DEFAULT 'not_applicable'
    CHECK (active_content_disposition IN ('not_applicable', 'rejected', 'sanitised')),

  -- Accessibility (FR6). Enforcement is the Block 08 publication gate, which calls
  -- private.asset_alt_text_ok(); a decorative image opts out explicitly.
  alt_text              text CHECK (alt_text IS NULL OR length(btrim(alt_text)) > 0),
  is_decorative         boolean NOT NULL DEFAULT false,
  caption               text,
  credit                text,

  -- Licensing (FR7).
  licence               text NOT NULL DEFAULT 'unknown'
    CHECK (licence IN ('all_rights_reserved', 'crux_proprietary', 'public_domain',
                       'cc0', 'cc_by', 'cc_by_sa', 'cc_by_nd', 'cc_by_nc',
                       'cc_by_nc_sa', 'cc_by_nc_nd', 'licensed_third_party', 'unknown')),
  attribution           text,
  attribution_required  boolean NOT NULL DEFAULT false,
  usage_restricted      boolean NOT NULL DEFAULT false,
  usage_restriction_note text,

  -- Public readability is an explicit editorial act, never implied by the bucket.
  is_publicly_readable  boolean NOT NULL DEFAULT false,

  -- Archive state. Assets are archived, never deleted, once they carry history.
  archive_status        text NOT NULL DEFAULT 'active'
    CHECK (archive_status IN ('active', 'archived', 'purge_pending')),
  archived_at           timestamptz,
  archived_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archive_reason        text,

  current_version_id    uuid,
  uploaded_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at           timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (bucket_key, storage_path),
  -- Target for the composite FK from assets.download_policies.
  UNIQUE (id, bucket_visibility),

  -- The block's central invariant: no object in a private bucket is ever
  -- publicly readable (§45.1.10, Security Requirements).
  CONSTRAINT assets_private_bucket_is_never_public_read
    CHECK (bucket_visibility = 'public' OR is_publicly_readable = false),

  CONSTRAINT assets_bucket_fk FOREIGN KEY (bucket_key, bucket_visibility)
    REFERENCES assets.buckets (key, visibility) ON UPDATE CASCADE ON DELETE RESTRICT,

  -- Dimensions are recorded as a pair or not at all.
  CONSTRAINT asset_dimensions_are_paired CHECK ((width IS NULL) = (height IS NULL)),
  -- Promotion requires a signature-verified type match (FR3).
  CONSTRAINT promoted_asset_has_matching_mime CHECK (
    validation_state <> 'promoted'
    OR (detected_mime IS NOT NULL AND detected_mime = declared_mime)
  ),
  -- Nothing is publicly readable before it has been promoted out of quarantine.
  CONSTRAINT public_read_requires_promotion CHECK (
    is_publicly_readable = false OR validation_state = 'promoted'
  ),
  CONSTRAINT attribution_present_when_required CHECK (
    NOT attribution_required OR (attribution IS NOT NULL AND length(btrim(attribution)) > 0)
  ),
  CONSTRAINT restricted_usage_is_explained CHECK (
    NOT usage_restricted OR (usage_restriction_note IS NOT NULL AND length(btrim(usage_restriction_note)) > 0)
  ),
  CONSTRAINT decorative_asset_has_no_alt_text CHECK (NOT is_decorative OR alt_text IS NULL),
  CONSTRAINT archived_asset_has_timestamp_and_reason CHECK (
    archive_status = 'active'
    OR (archived_at IS NOT NULL AND archive_reason IS NOT NULL)
  ),
  -- An archived asset is withdrawn from public read at the same moment.
  CONSTRAINT archived_asset_is_not_publicly_readable CHECK (
    archive_status = 'active' OR is_publicly_readable = false
  )
);

COMMENT ON TABLE assets.assets IS
  'Asset metadata: filename, bucket, declared and detected MIME, size, checksum, dimensions, alternative text, licensing and archive state (§45.1.10 FR2, FR4, FR6, FR7).';
COMMENT ON COLUMN assets.assets.storage_path IS
  'Server-generated opaque object path. The uploaded filename is normalised for display only and is never used as a storage path.';
COMMENT ON COLUMN assets.assets.bucket_visibility IS
  'Mirror of assets.buckets.visibility, maintained by trigger and pinned by a composite foreign key. Exists so the private-bucket invariant is a declarative CHECK rather than a trigger.';
COMMENT ON COLUMN assets.assets.detected_mime IS
  'Type determined server-side from the file signature. The declared header is untrusted; promotion requires the two to agree.';
COMMENT ON COLUMN assets.assets.checksum_sha256 IS
  'SHA-256 computed at upload and verified on promotion. Exposed alongside downloadable reports and datasets so recipients can verify integrity (FR4).';
COMMENT ON COLUMN assets.assets.is_publicly_readable IS
  'Explicit editorial act. Structurally impossible for an asset in a private bucket (assets_private_bucket_is_never_public_read).';
COMMENT ON COLUMN assets.assets.current_version_id IS
  'Editorial convenience pointer to the newest version. Published content never resolves through this column; it references an assets.asset_versions row directly (FR5).';
COMMENT ON COLUMN assets.assets.active_content_disposition IS
  'Records the choice made for SVG and other active-content formats: rejected or sanitised before promotion (Security Requirements).';

CREATE INDEX assets_bucket_idx        ON assets.assets (bucket_key);
CREATE INDEX assets_uploaded_by_idx   ON assets.assets (uploaded_by);
CREATE INDEX assets_archived_by_idx   ON assets.assets (archived_by);
CREATE INDEX assets_checksum_idx      ON assets.assets (checksum_sha256);
CREATE INDEX assets_validation_idx    ON assets.assets (validation_state)
  WHERE validation_state <> 'promoted';
CREATE INDEX assets_archive_idx       ON assets.assets (archive_status)
  WHERE archive_status <> 'active';
CREATE INDEX assets_class_idx         ON assets.assets (asset_class);
CREATE INDEX assets_public_read_idx   ON assets.assets (bucket_key, uploaded_at DESC)
  WHERE is_publicly_readable;
CREATE INDEX assets_current_version_idx ON assets.assets (current_version_id);

-- ---------------------------------------------------------------------------
-- assets.asset_versions (FR5). Replacing an asset creates a new version and
-- preserves the prior one. A promoted version is immutable and undeletable, so a
-- published reference can never be silently repointed or removed.
-- ---------------------------------------------------------------------------
CREATE TABLE assets.asset_versions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id           uuid NOT NULL REFERENCES assets.assets(id) ON DELETE CASCADE,
  version_number     integer NOT NULL CHECK (version_number > 0),
  -- Stable public identifier, mirroring cms.content_versions.public_version_id.
  public_version_id  text NOT NULL UNIQUE DEFAULT ('av-' || encode(gen_random_bytes(6), 'hex')),
  -- Immutable object path for this exact version. Distinct from the asset's
  -- current path so that superseding an asset never overwrites an object.
  storage_path       text NOT NULL UNIQUE CHECK (length(btrim(storage_path)) > 0),
  declared_mime      text NOT NULL
    CHECK (declared_mime ~ '^[a-zA-Z0-9!#$&^_.+-]+/[a-zA-Z0-9!#$&^_.+-]+$'),
  detected_mime      text
    CHECK (detected_mime IS NULL OR detected_mime ~ '^[a-zA-Z0-9!#$&^_.+-]+/[a-zA-Z0-9!#$&^_.+-]+$'),
  byte_size          bigint NOT NULL CHECK (byte_size > 0),
  checksum_sha256    text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  width              integer CHECK (width IS NULL OR width > 0),
  height             integer CHECK (height IS NULL OR height > 0),
  validation_state   text NOT NULL DEFAULT 'pending'
    CHECK (validation_state IN ('pending', 'passed', 'failed', 'promoted', 'rejected')),
  validated_at       timestamptz,
  validation_notes   text,
  -- Set when a later version supersedes this one. Prior versions are preserved,
  -- not deleted; retirement is the only permitted change to a promoted row.
  retired_at         timestamptz,
  replaces_version_id uuid REFERENCES assets.asset_versions(id) ON DELETE RESTRICT,
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  UNIQUE (asset_id, version_number),
  -- Target for the composite FK from assets.assets.current_version_id, which
  -- guarantees the pointer can only address a version of that same asset.
  UNIQUE (id, asset_id),

  CONSTRAINT asset_version_dimensions_are_paired CHECK ((width IS NULL) = (height IS NULL)),
  CONSTRAINT asset_version_no_self_replacement
    CHECK (replaces_version_id IS NULL OR replaces_version_id <> id),
  CONSTRAINT promoted_version_has_matching_mime CHECK (
    validation_state <> 'promoted'
    OR (detected_mime IS NOT NULL AND detected_mime = declared_mime)
  ),
  CONSTRAINT validated_version_has_timestamp CHECK (
    validation_state IN ('pending')
    OR validated_at IS NOT NULL
  )
);

COMMENT ON TABLE assets.asset_versions IS
  'Immutable per-version record of an asset''s bytes (§45.1.10 FR5). A published content version always references a row here, never assets.assets.current_version_id.';
COMMENT ON COLUMN assets.asset_versions.storage_path IS
  'Globally unique object path for this version. Superseding an asset writes a new object; it never overwrites an existing one.';
COMMENT ON COLUMN assets.asset_versions.retired_at IS
  'Marks a superseded version. The only field a promoted version is permitted to change; the bytes, checksum and path are frozen.';

CREATE INDEX asset_versions_asset_idx    ON assets.asset_versions (asset_id, version_number DESC);
CREATE INDEX asset_versions_created_by_idx ON assets.asset_versions (created_by);
CREATE INDEX asset_versions_replaces_idx ON assets.asset_versions (replaces_version_id)
  WHERE replaces_version_id IS NOT NULL;
CREATE INDEX asset_versions_checksum_idx ON assets.asset_versions (checksum_sha256);
CREATE INDEX asset_versions_state_idx    ON assets.asset_versions (validation_state)
  WHERE validation_state <> 'promoted';
CREATE INDEX asset_versions_live_idx     ON assets.asset_versions (asset_id)
  WHERE retired_at IS NULL;

-- The current-version pointer can only address a version of this same asset.
-- ON DELETE SET NULL names the column explicitly so the asset's own id is untouched.
ALTER TABLE assets.assets
  ADD CONSTRAINT assets_current_version_fk
  FOREIGN KEY (current_version_id, id) REFERENCES assets.asset_versions (id, asset_id)
  ON DELETE SET NULL (current_version_id);

-- ---------------------------------------------------------------------------
-- assets.content_asset_usages — the pin between published content and a specific
-- asset version (FR5, FR6, FR7). The foreign key targets assets.asset_versions,
-- so there is no mutable pointer for a published reference to drift through.
-- ---------------------------------------------------------------------------
CREATE TABLE assets.content_asset_usages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_version_id    uuid NOT NULL REFERENCES cms.content_versions(id) ON DELETE CASCADE,
  -- RESTRICT, not CASCADE: an asset version that published content depends on
  -- cannot be removed out from under it.
  asset_version_id      uuid NOT NULL REFERENCES assets.asset_versions(id) ON DELETE RESTRICT,
  usage                 text NOT NULL DEFAULT 'inline'
    CHECK (usage IN ('hero', 'inline', 'figure', 'thumbnail', 'attachment',
                     'download', 'avatar', 'social_card')),
  -- Matches cms.content_version_modules.fragment_id when the usage sits inside a
  -- module. Not a foreign key: fragment ids are unique only within their version.
  fragment_id           text,
  position              integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  -- FR7: attaching a restrictively licensed asset requires an explicit, audited
  -- override. Recorded here as a set, never partially.
  licence_override_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  licence_override_at     timestamptz,
  licence_override_reason text,
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT licence_override_is_complete_or_absent CHECK (
    (licence_override_by IS NULL AND licence_override_at IS NULL AND licence_override_reason IS NULL)
    OR (licence_override_by IS NOT NULL AND licence_override_at IS NOT NULL
        AND licence_override_reason IS NOT NULL AND length(btrim(licence_override_reason)) > 0)
  )
);

COMMENT ON TABLE assets.content_asset_usages IS
  'Binds a cms.content_versions row to a specific assets.asset_versions row (§45.1.10 FR5). Replacing an asset leaves published references pointing at the original version because the reference is to the version, not the asset.';
COMMENT ON COLUMN assets.content_asset_usages.licence_override_by IS
  'FR7. Set only when a usage-restricted asset is attached; the accompanying trigger writes an audit.events row so the override is reviewable.';

CREATE INDEX cau_content_version_idx ON assets.content_asset_usages (content_version_id, position);
CREATE INDEX cau_asset_version_idx   ON assets.content_asset_usages (asset_version_id);
CREATE INDEX cau_override_by_idx     ON assets.content_asset_usages (licence_override_by)
  WHERE licence_override_by IS NOT NULL;
CREATE UNIQUE INDEX cau_unique_usage_idx ON assets.content_asset_usages
  (content_version_id, asset_version_id, usage, coalesce(fragment_id, ''));

-- ---------------------------------------------------------------------------
-- assets.download_policies (FR11, FR13). The gate is declared per asset and its
-- kind is data, not code: eight kinds are supported and an asset may carry more
-- than one active policy (a paid baseline plus a time-limited campaign, say),
-- resolved by precedence. Nothing here hard-codes a single gating model.
-- ---------------------------------------------------------------------------
CREATE TABLE assets.download_policies (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id              uuid NOT NULL,
  -- Mirror of assets.bucket_visibility, filled by trigger and pinned by the
  -- composite FK below, so 'a private asset can never carry a public policy' is
  -- a CHECK rather than application logic.
  asset_bucket_visibility text NOT NULL CHECK (asset_bucket_visibility IN ('public', 'private')),
  policy_kind           text NOT NULL
    CHECK (policy_kind IN ('public', 'email_only', 'free_account', 'verified_account',
                           'role_restricted', 'time_limited', 'campaign', 'paid')),

  -- Kind-specific parameters. Each is required by exactly its own kind and
  -- forbidden elsewhere, so a policy row cannot carry meaningless configuration.
  required_role_key     text REFERENCES identity.roles(key) ON DELETE RESTRICT,
  required_subscription_tier text
    CHECK (required_subscription_tier IS NULL OR required_subscription_tier IN
           ('registered', 'member', 'research', 'institutional', 'enterprise')),
  campaign_code         text CHECK (campaign_code IS NULL OR length(btrim(campaign_code)) > 0),
  effective_from        timestamptz,
  effective_until       timestamptz,

  -- Issuance controls. Expiry is short and configurable (FR10); the issuance
  -- route is rate-limited per user and per IP (Security Requirements).
  signed_url_ttl_seconds integer NOT NULL DEFAULT 300
    CHECK (signed_url_ttl_seconds BETWEEN 30 AND 3600),
  max_downloads_per_actor integer CHECK (max_downloads_per_actor IS NULL OR max_downloads_per_actor > 0),
  rate_limit_per_hour   integer NOT NULL DEFAULT 20 CHECK (rate_limit_per_hour > 0),
  -- Metadata may be shown publicly even when the object is gated (FR13).
  metadata_public       boolean NOT NULL DEFAULT true,

  precedence            integer NOT NULL DEFAULT 0,
  is_active             boolean NOT NULL DEFAULT true,
  notes                 text,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT download_policies_asset_fk
    FOREIGN KEY (asset_id, asset_bucket_visibility)
    REFERENCES assets.assets (id, bucket_visibility) ON UPDATE CASCADE ON DELETE CASCADE,

  -- A private object has no ungated read path, by construction.
  CONSTRAINT public_policy_requires_public_bucket
    CHECK (policy_kind <> 'public' OR asset_bucket_visibility = 'public'),

  CONSTRAINT role_parameter_matches_kind CHECK (
    (policy_kind = 'role_restricted') = (required_role_key IS NOT NULL)
  ),
  CONSTRAINT tier_parameter_matches_kind CHECK (
    (policy_kind = 'paid') = (required_subscription_tier IS NOT NULL)
  ),
  CONSTRAINT campaign_parameter_matches_kind CHECK (
    (policy_kind = 'campaign') = (campaign_code IS NOT NULL)
  ),
  CONSTRAINT time_limited_has_a_window CHECK (
    policy_kind <> 'time_limited'
    OR (effective_from IS NOT NULL AND effective_until IS NOT NULL)
  ),
  CONSTRAINT policy_window_is_ordered CHECK (
    effective_from IS NULL OR effective_until IS NULL OR effective_until > effective_from
  )
);

COMMENT ON TABLE assets.download_policies IS
  'Per-asset access policy (§45.1.10 FR11, FR13). Eight gating kinds are first-class data; an asset may carry several active policies resolved by precedence. Evaluation is server-side, immediately before signed-URL issuance.';
COMMENT ON COLUMN assets.download_policies.asset_bucket_visibility IS
  'Mirror of the asset''s bucket visibility, cascaded from assets.assets. Makes public_policy_requires_public_bucket a declarative constraint and blocks flipping a bucket to private while a public policy exists.';
COMMENT ON COLUMN assets.download_policies.signed_url_ttl_seconds IS
  'Lifetime of the issued signed URL, 30s-1h. The URL itself is issued per request, never cached and never stored (FR10).';
COMMENT ON COLUMN assets.download_policies.required_subscription_tier IS
  'Tier vocabulary is a CHECK rather than a foreign key because the subscriptions schema is populated by Block 14. Replace with an FK when that table lands.';

CREATE INDEX download_policies_asset_idx ON assets.download_policies (asset_id, precedence DESC)
  WHERE is_active;
CREATE INDEX download_policies_kind_idx  ON assets.download_policies (policy_kind);
CREATE INDEX download_policies_role_idx  ON assets.download_policies (required_role_key)
  WHERE required_role_key IS NOT NULL;
CREATE INDEX download_policies_created_by_idx ON assets.download_policies (created_by);
CREATE INDEX download_policies_window_idx ON assets.download_policies (effective_from, effective_until)
  WHERE effective_until IS NOT NULL;
CREATE UNIQUE INDEX download_policies_one_active_per_kind_idx ON assets.download_policies
  (asset_id, policy_kind, coalesce(campaign_code, '')) WHERE is_active;

-- ---------------------------------------------------------------------------
-- assets.download_entitlements (FR11). The other half of the gate: what a role,
-- a subscription tier, or a per-user grant is permitted to download, and over
-- which scope. Evaluation joins a subject's entitlements against the asset's
-- policies server-side, immediately before issuance.
-- ---------------------------------------------------------------------------
CREATE TABLE assets.download_entitlements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind        text NOT NULL
    CHECK (subject_kind IN ('role', 'subscription_tier', 'user_grant')),
  role_key            text REFERENCES identity.roles(key) ON DELETE CASCADE,
  subscription_tier   text
    CHECK (subscription_tier IS NULL OR subscription_tier IN
           ('registered', 'member', 'research', 'institutional', 'enterprise')),
  user_id             uuid REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What the subject may pass. A subject satisfying a 'paid' entitlement clears a
  -- 'paid' policy on assets within scope; it does not clear any other kind.
  satisfies_policy_kind text NOT NULL
    CHECK (satisfies_policy_kind IN ('public', 'email_only', 'free_account',
                                     'verified_account', 'role_restricted',
                                     'time_limited', 'campaign', 'paid')),

  -- Scope: everything, one bucket, or one asset.
  scope_kind          text NOT NULL DEFAULT 'global'
    CHECK (scope_kind IN ('global', 'bucket', 'asset')),
  bucket_key          text REFERENCES assets.buckets(key) ON DELETE CASCADE,
  asset_id            uuid REFERENCES assets.assets(id) ON DELETE CASCADE,

  -- Quota, if the grant is metered.
  max_downloads       integer CHECK (max_downloads IS NULL OR max_downloads > 0),
  quota_period        text
    CHECK (quota_period IS NULL OR quota_period IN ('day', 'week', 'month', 'year', 'total')),

  valid_from          timestamptz NOT NULL DEFAULT now(),
  valid_until         timestamptz,
  revoked_at          timestamptz,
  revocation_reason   text,
  is_active           boolean NOT NULL DEFAULT true,
  notes               text,
  granted_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at          timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT entitlement_subject_matches_kind CHECK (
    (subject_kind = 'role'              AND role_key IS NOT NULL AND subscription_tier IS NULL AND user_id IS NULL)
    OR (subject_kind = 'subscription_tier' AND subscription_tier IS NOT NULL AND role_key IS NULL AND user_id IS NULL)
    OR (subject_kind = 'user_grant'     AND user_id IS NOT NULL AND role_key IS NULL AND subscription_tier IS NULL)
  ),
  CONSTRAINT entitlement_scope_matches_kind CHECK (
    (scope_kind = 'global' AND bucket_key IS NULL AND asset_id IS NULL)
    OR (scope_kind = 'bucket' AND bucket_key IS NOT NULL AND asset_id IS NULL)
    OR (scope_kind = 'asset'  AND asset_id IS NOT NULL AND bucket_key IS NULL)
  ),
  CONSTRAINT entitlement_quota_is_complete_or_absent CHECK (
    (max_downloads IS NULL AND quota_period IS NULL)
    OR (max_downloads IS NOT NULL AND quota_period IS NOT NULL)
  ),
  CONSTRAINT entitlement_window_is_ordered CHECK (
    valid_until IS NULL OR valid_until > valid_from
  ),
  CONSTRAINT revoked_entitlement_is_inactive_and_explained CHECK (
    revoked_at IS NULL
    OR (is_active = false AND revocation_reason IS NOT NULL AND length(btrim(revocation_reason)) > 0)
  )
);

COMMENT ON TABLE assets.download_entitlements IS
  'What a role, subscription tier or per-user grant permits (§45.1.10 FR11). Scoped globally, to a bucket, or to a single asset. Revoked rather than deleted so history stays interpretable.';
COMMENT ON COLUMN assets.download_entitlements.satisfies_policy_kind IS
  'The policy kind this entitlement clears. Entitlements and policies are matched at issuance time; neither side assumes a single gating model.';

CREATE INDEX download_entitlements_role_idx   ON assets.download_entitlements (role_key)
  WHERE role_key IS NOT NULL;
CREATE INDEX download_entitlements_tier_idx   ON assets.download_entitlements (subscription_tier)
  WHERE subscription_tier IS NOT NULL;
CREATE INDEX download_entitlements_user_idx   ON assets.download_entitlements (user_id)
  WHERE user_id IS NOT NULL;
CREATE INDEX download_entitlements_asset_idx  ON assets.download_entitlements (asset_id)
  WHERE asset_id IS NOT NULL;
CREATE INDEX download_entitlements_bucket_idx ON assets.download_entitlements (bucket_key)
  WHERE bucket_key IS NOT NULL;
CREATE INDEX download_entitlements_granted_by_idx ON assets.download_entitlements (granted_by);
-- The issuance path: resolve live entitlements for a subject and policy kind.
CREATE INDEX download_entitlements_live_idx ON assets.download_entitlements
  (subject_kind, satisfies_policy_kind, scope_kind)
  WHERE is_active AND revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- assets.download_events (FR12) — APPEND-ONLY download history.
-- Written on every issuance attempt, successful or not, immediately after the
-- server-side entitlement decision. The signed URL itself is never stored (FR10).
-- Identity bigint primary key rather than uuid: this is a high-volume, strictly
-- chronological log, exactly as audit.events is.
-- ---------------------------------------------------------------------------
CREATE TABLE assets.download_events (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at         timestamptz NOT NULL DEFAULT now(),
  -- Nullable: anonymous and email-only downloads have no account. Deliberately
  -- NOT a foreign key, matching audit.events — an append-only history must
  -- survive account deletion, and any ON DELETE action would be an UPDATE or
  -- DELETE on this table, which the append-only trigger below forbids.
  actor_id            uuid,
  actor_label         text,
  -- RESTRICT everywhere below for the same reason: SET NULL and CASCADE both
  -- mutate or remove rows in an append-only table. History pins its referents.
  asset_version_id    uuid NOT NULL REFERENCES assets.asset_versions(id) ON DELETE RESTRICT,
  policy_id           uuid REFERENCES assets.download_policies(id) ON DELETE RESTRICT,
  entitlement_id      uuid REFERENCES assets.download_entitlements(id) ON DELETE RESTRICT,
  -- The basis on which the decision was made, recorded independently of the rows
  -- above so the reason survives even if a policy is later rewritten.
  entitlement_basis   text NOT NULL
    CHECK (entitlement_basis IN ('public', 'email_only', 'free_account', 'verified_account',
                                 'role_restricted', 'time_limited', 'campaign', 'paid',
                                 'service_role', 'none')),
  entitlement_subject_kind text
    CHECK (entitlement_subject_kind IS NULL
           OR entitlement_subject_kind IN ('role', 'subscription_tier', 'user_grant')),
  request_id          text,
  succeeded           boolean NOT NULL,
  failure_reason      text
    CHECK (failure_reason IS NULL OR failure_reason IN
           ('not_authenticated', 'email_not_verified', 'no_entitlement',
            'entitlement_expired', 'entitlement_revoked', 'policy_inactive',
            'outside_time_window', 'quota_exceeded', 'rate_limited',
            'asset_archived', 'asset_not_promoted', 'checksum_mismatch',
            'signing_failed', 'other')),
  -- Coarse region only: ISO 3166-1 alpha-2. No IP address is retained.
  region_code         text CHECK (region_code IS NULL OR region_code ~ '^[A-Z]{2}$'),
  -- The TTL that was granted, for audit. The URL is never recorded.
  signed_url_ttl_seconds integer
    CHECK (signed_url_ttl_seconds IS NULL OR signed_url_ttl_seconds BETWEEN 30 AND 3600),
  detail              jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT failure_reason_matches_outcome CHECK (succeeded = (failure_reason IS NULL)),
  CONSTRAINT successful_issuance_has_a_ttl CHECK (
    NOT succeeded OR signed_url_ttl_seconds IS NOT NULL
  ),
  CONSTRAINT successful_issuance_has_a_basis CHECK (
    NOT succeeded OR entitlement_basis <> 'none'
  )
);

COMMENT ON TABLE assets.download_events IS
  'Append-only download history (§45.1.10 FR12). Records actor, asset version, entitlement basis, request id, timestamp, outcome and coarse region. No UPDATE or DELETE by any role, including roles that bypass RLS. The signed URL is never stored.';
COMMENT ON COLUMN assets.download_events.actor_id IS
  'Nullable and intentionally unconstrained by a foreign key: anonymous downloads have no actor, and an append-only log cannot accept the UPDATE that ON DELETE SET NULL would perform. Mirrors audit.events.actor_id.';
COMMENT ON COLUMN assets.download_events.asset_version_id IS
  'ON DELETE RESTRICT: an asset version with download history cannot be deleted. Archive the asset instead.';
COMMENT ON COLUMN assets.download_events.region_code IS
  'Coarse region for abuse analysis. Country granularity only; no IP address, city or device fingerprint is retained.';

CREATE INDEX download_events_occurred_at_idx ON assets.download_events (occurred_at DESC);
-- "History is visible to the user for their own downloads" (FR12).
CREATE INDEX download_events_actor_idx       ON assets.download_events (actor_id, occurred_at DESC)
  WHERE actor_id IS NOT NULL;
CREATE INDEX download_events_version_idx     ON assets.download_events (asset_version_id, occurred_at DESC);
CREATE INDEX download_events_policy_idx      ON assets.download_events (policy_id)
  WHERE policy_id IS NOT NULL;
CREATE INDEX download_events_entitlement_idx ON assets.download_events (entitlement_id)
  WHERE entitlement_id IS NOT NULL;
CREATE INDEX download_events_request_idx     ON assets.download_events (request_id)
  WHERE request_id IS NOT NULL;
-- Denial review and rate-limit forensics (Block 09 download manager).
CREATE INDEX download_events_failures_idx    ON assets.download_events (failure_reason, occurred_at DESC)
  WHERE NOT succeeded;

-- ---------------------------------------------------------------------------
-- Append-only enforcement, at table level so it holds even against BYPASSRLS.
-- Same shape as private.reject_audit_mutation() in Block 04.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.reject_download_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'assets.download_events is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

COMMENT ON FUNCTION private.reject_download_event_mutation() IS
  'Rejects UPDATE and DELETE on assets.download_events (§45.1.10 FR12). Table-level, so it applies to service_role and any BYPASSRLS role.';

CREATE TRIGGER download_events_no_update
  BEFORE UPDATE ON assets.download_events
  FOR EACH ROW EXECUTE FUNCTION private.reject_download_event_mutation();

CREATE TRIGGER download_events_no_delete
  BEFORE DELETE ON assets.download_events
  FOR EACH ROW EXECUTE FUNCTION private.reject_download_event_mutation();

-- ---------------------------------------------------------------------------
-- Bucket-visibility mirroring. Two small triggers whose single responsibility is
-- to derive a column from its parent, so the private-bucket invariant can be a
-- declarative CHECK. No business logic lives here (rules/database.md 19c).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.sync_asset_bucket_visibility()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_visibility text;
BEGIN
  SELECT b.visibility INTO v_visibility
    FROM assets.buckets b WHERE b.key = NEW.bucket_key;

  IF v_visibility IS NULL THEN
    RAISE EXCEPTION 'unknown storage bucket %', NEW.bucket_key
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  NEW.bucket_visibility := v_visibility;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.sync_asset_bucket_visibility() IS
  'Derives assets.assets.bucket_visibility from assets.buckets. Deterministic, single-purpose; the composite FK then pins the derived value.';

CREATE TRIGGER assets_sync_bucket_visibility
  BEFORE INSERT OR UPDATE ON assets.assets
  FOR EACH ROW EXECUTE FUNCTION private.sync_asset_bucket_visibility();

CREATE OR REPLACE FUNCTION private.sync_policy_bucket_visibility()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_visibility text;
BEGIN
  SELECT a.bucket_visibility INTO v_visibility
    FROM assets.assets a WHERE a.id = NEW.asset_id;

  IF v_visibility IS NULL THEN
    RAISE EXCEPTION 'unknown asset %', NEW.asset_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  NEW.asset_bucket_visibility := v_visibility;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.sync_policy_bucket_visibility() IS
  'Derives assets.download_policies.asset_bucket_visibility from the asset. Deterministic, single-purpose.';

CREATE TRIGGER download_policies_sync_bucket_visibility
  BEFORE INSERT OR UPDATE ON assets.download_policies
  FOR EACH ROW EXECUTE FUNCTION private.sync_policy_bucket_visibility();

-- ---------------------------------------------------------------------------
-- Version immutability (FR5). A promoted version's bytes, path, checksum and
-- type are frozen, and it cannot be deleted. Retirement is the one permitted
-- change. Mirrors private.enforce_version_immutability() in Block 05.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.enforce_asset_version_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.validation_state = 'promoted' THEN
      RAISE EXCEPTION 'promoted asset version % is immutable: DELETE is not permitted', OLD.id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.validation_state = 'promoted' THEN
    IF NEW.asset_id         IS DISTINCT FROM OLD.asset_id
    OR NEW.version_number   IS DISTINCT FROM OLD.version_number
    OR NEW.public_version_id IS DISTINCT FROM OLD.public_version_id
    OR NEW.storage_path     IS DISTINCT FROM OLD.storage_path
    OR NEW.declared_mime    IS DISTINCT FROM OLD.declared_mime
    OR NEW.detected_mime    IS DISTINCT FROM OLD.detected_mime
    OR NEW.byte_size        IS DISTINCT FROM OLD.byte_size
    OR NEW.checksum_sha256  IS DISTINCT FROM OLD.checksum_sha256
    OR NEW.width            IS DISTINCT FROM OLD.width
    OR NEW.height           IS DISTINCT FROM OLD.height
    THEN
      RAISE EXCEPTION 'promoted asset version % is immutable: bytes, path, checksum and type cannot change', OLD.id
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.validation_state <> 'promoted' THEN
      RAISE EXCEPTION 'promoted asset version % cannot return to state %', OLD.id, NEW.validation_state
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.enforce_asset_version_immutability() IS
  'Freezes a promoted asset version (§45.1.10 FR5), so a published content reference can never be repointed or deleted. Convention is not enforcement (rules/database.md 15).';

CREATE TRIGGER asset_versions_immutable
  BEFORE UPDATE OR DELETE ON assets.asset_versions
  FOR EACH ROW EXECUTE FUNCTION private.enforce_asset_version_immutability();

-- Usages of a published content version are frozen, exactly as its contributors
-- and modules are in Block 05.
CREATE OR REPLACE FUNCTION private.enforce_asset_usage_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM cms.content_versions
   WHERE id = COALESCE(NEW.content_version_id, OLD.content_version_id);

  IF v_status = 'published' THEN
    RAISE EXCEPTION 'asset usages of published version % are immutable (%)',
      COALESCE(NEW.content_version_id, OLD.content_version_id), TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER content_asset_usages_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON assets.content_asset_usages
  FOR EACH ROW EXECUTE FUNCTION private.enforce_asset_usage_immutability();

-- FR7: a usage-restricted asset may only be attached with an explicit override,
-- and the override is audited. One named responsibility; the audit write is the
-- requirement, not incidental behaviour.
CREATE OR REPLACE FUNCTION private.guard_restricted_licence_usage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_asset_id    uuid;
  v_restricted  boolean;
  v_licence     text;
BEGIN
  SELECT a.id, a.usage_restricted, a.licence
    INTO v_asset_id, v_restricted, v_licence
    FROM assets.asset_versions av
    JOIN assets.assets a ON a.id = av.asset_id
   WHERE av.id = NEW.asset_version_id;

  IF v_restricted AND NEW.licence_override_by IS NULL THEN
    RAISE EXCEPTION
      'asset % carries a restricted licence (%); attaching it requires an explicit override', v_asset_id, v_licence
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_restricted THEN
    PERFORM private.log_audit(
      'asset.restricted_licence_override',
      'assets.content_asset_usages',
      NEW.id::text,
      'allowed',
      jsonb_build_object(
        'asset_id',           v_asset_id,
        'asset_version_id',   NEW.asset_version_id,
        'content_version_id', NEW.content_version_id,
        'licence',            v_licence,
        'reason',             NEW.licence_override_reason,
        'approved_by',        NEW.licence_override_by
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.guard_restricted_licence_usage() IS
  'Blocks attaching a usage-restricted asset without an explicit override, and writes the audit row that FR7 requires.';

CREATE TRIGGER content_asset_usages_licence_guard
  AFTER INSERT ON assets.content_asset_usages
  FOR EACH ROW EXECUTE FUNCTION private.guard_restricted_licence_usage();

-- ---------------------------------------------------------------------------
-- Publication-gate helpers (FR6). Read-only predicates the Block 08 gate calls;
-- the gate itself lives there, not here.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.asset_alt_text_ok(p_asset_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT a.asset_class NOT IN ('image', 'avatar')
      OR a.is_decorative
      OR (a.alt_text IS NOT NULL AND length(btrim(a.alt_text)) > 0)
    FROM assets.assets a
   WHERE a.id = p_asset_id;
$$;

COMMENT ON FUNCTION private.asset_alt_text_ok(uuid) IS
  'True when an image asset has non-empty alternative text or is explicitly decorative (§45.1.10 FR6).';

CREATE OR REPLACE FUNCTION private.content_version_alt_text_ok(p_content_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
      FROM assets.content_asset_usages u
      JOIN assets.asset_versions av ON av.id = u.asset_version_id
     WHERE u.content_version_id = p_content_version_id
       AND NOT private.asset_alt_text_ok(av.asset_id)
  );
$$;

COMMENT ON FUNCTION private.content_version_alt_text_ok(uuid) IS
  'Publication gate predicate: every image the content version uses has alternative text (§45.1.10 FR6, enforced by Block 08).';

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
CREATE TRIGGER buckets_updated_at BEFORE UPDATE ON assets.buckets
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER assets_updated_at BEFORE UPDATE ON assets.assets
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER asset_versions_updated_at BEFORE UPDATE ON assets.asset_versions
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER download_policies_updated_at BEFORE UPDATE ON assets.download_policies
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER download_entitlements_updated_at BEFORE UPDATE ON assets.download_entitlements
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
-- assets.content_asset_usages and assets.download_events carry no updated_at:
-- the first is frozen once its content version publishes and is otherwise
-- replaced rather than edited, the second is append-only.

-- ---------------------------------------------------------------------------
-- RLS on from creation; every policy is owned by the later RLS migration
-- (rules/database.md 6).
-- ---------------------------------------------------------------------------
ALTER TABLE assets.buckets                ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets.assets                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets.asset_versions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets.content_asset_usages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets.download_policies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets.download_entitlements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets.download_events        ENABLE ROW LEVEL SECURITY;
