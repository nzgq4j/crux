-- Blocks 05, 06, 15 — index every foreign key (rules/database.md rule 21)
--
-- WHY THIS EXISTS
-- scripts/db-verify.sh found sixteen foreign keys with no index on their leading
-- column. An unindexed FK costs twice: the referencing lookup is a sequential scan,
-- and every DELETE or key UPDATE on the parent must scan the child to enforce the
-- constraint. On `cms.content_items.current_version_id` that means a full scan of
-- content_items on every version delete.
--
-- Each index below is justified by a real access path, not added reflexively —
-- rule 22 warns that an unused index is a write cost with no benefit. Where a
-- column is sparse the index is partial, so it stays small.
--
-- Reverse: DROP INDEX for each.

-- accounts ------------------------------------------------------------------
-- Path: "which account owns this external identity", and the cascade on user delete.
CREATE INDEX IF NOT EXISTS external_identities_user_idx
  ON accounts.external_identities (user_id);

-- Path: resolving a platform account to its bibliographic person. Sparse — most
-- users are not cited authors.
CREATE INDEX IF NOT EXISTS profiles_person_idx
  ON accounts.profiles (person_id) WHERE person_id IS NOT NULL;

-- cms -----------------------------------------------------------------------
-- Path: "content created by this user" in the admin content library filter.
CREATE INDEX IF NOT EXISTS content_items_created_by_idx
  ON cms.content_items (created_by) WHERE created_by IS NOT NULL;

-- Path: the FK enforcement scan when a version is deleted. Without this, deleting
-- any draft version sequentially scans every content item.
CREATE INDEX IF NOT EXISTS content_items_current_version_idx
  ON cms.content_items (current_version_id) WHERE current_version_id IS NOT NULL;

-- Path: "which versions use this module type", used by the module catalogue and by
-- the RESTRICT check when retiring a module type.
CREATE INDEX IF NOT EXISTS cvm_module_key_idx
  ON cms.content_version_modules (module_key);

CREATE INDEX IF NOT EXISTS content_versions_created_by_idx
  ON cms.content_versions (created_by) WHERE created_by IS NOT NULL;

-- Path: version-aware citation resolution walks the supersession chain in both
-- directions — forward to find the current version, backward to render history.
CREATE INDEX IF NOT EXISTS content_versions_supersedes_idx
  ON cms.content_versions (supersedes_id) WHERE supersedes_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS content_versions_superseded_by_idx
  ON cms.content_versions (superseded_by_id) WHERE superseded_by_id IS NOT NULL;

-- identity ------------------------------------------------------------------
-- Path: "experts at this organisation" on the organisation surface.
CREATE INDEX IF NOT EXISTS expert_profiles_organisation_idx
  ON identity.expert_profiles (organisation_id) WHERE organisation_id IS NOT NULL;

-- Paths: resolving DOI/ORCID/ROR for a subject, and the cascade on subject delete.
-- Three partial indexes rather than one composite, because the CHECK constraint
-- guarantees exactly one of the three is non-null on any row.
CREATE INDEX IF NOT EXISTS external_identifiers_person_idx
  ON identity.external_identifiers (person_id) WHERE person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS external_identifiers_organisation_idx
  ON identity.external_identifiers (organisation_id) WHERE organisation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS external_identifiers_content_idx
  ON identity.external_identifiers (content_item_id) WHERE content_item_id IS NOT NULL;

-- Path: "which roles grant this permission" — the reverse of the permission check,
-- used by the admin permission matrix and by the orphan-permission verification.
CREATE INDEX IF NOT EXISTS role_permissions_permission_idx
  ON identity.role_permissions (permission_key);

-- Path: the audit question "what did this administrator assign".
CREATE INDEX IF NOT EXISTS user_roles_assigned_by_idx
  ON identity.user_roles (assigned_by) WHERE assigned_by IS NOT NULL;

-- search --------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS search_boosts_created_by_idx
  ON search.boosts (created_by) WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS search_suppressions_created_by_idx
  ON search.suppressions (created_by) WHERE created_by IS NOT NULL;
