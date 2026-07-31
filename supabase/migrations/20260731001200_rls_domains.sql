-- Block 07 / Block 13 / Block 14 — RLS for the asset and subscription domains
-- (§45.1.10, §45.1.11 storage and subscription-based access classes)
--
-- Reverse: DROP POLICY for each policy below. RLS stays enabled: reversal fails closed.

-- ---------------------------------------------------------------------------
-- Subscription-based access (§45.1.11 policy class).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.has_active_entitlement(p_policy_kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
      FROM assets.download_entitlements e
     WHERE e.is_active
       AND e.revoked_at IS NULL
       AND (e.valid_from  IS NULL OR e.valid_from  <= now())
       AND (e.valid_until IS NULL OR e.valid_until >  now())
       AND (e.satisfies_policy_kind = p_policy_kind OR p_policy_kind IS NULL)
       AND (
            (e.subject_kind = 'user' AND e.user_id = auth.uid())
         OR (e.subject_kind = 'role' AND private.has_role(e.role_key))
       )
  );
$$;

COMMENT ON FUNCTION private.has_active_entitlement(text) IS
  'Entitlement evaluated INSIDE the policy (§45.1.11). An expired or revoked grant '
  'stops granting at the next request; there is no cached decision.';

-- ---------------------------------------------------------------------------
-- Assets. Public buckets are readable; private objects are not readable at all
-- through the API — delivery is signed-URL only, issued by the trusted server layer.
-- ---------------------------------------------------------------------------
CREATE POLICY buckets_read ON assets.buckets
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY buckets_write ON assets.buckets
  FOR ALL TO authenticated
  USING (private.has_permission('admin.manage_settings'))
  WITH CHECK (private.has_permission('admin.manage_settings'));

-- Metadata of a public-bucket asset is readable. A private asset's row is readable
-- only by asset managers and editorial staff — a visitor learns of a gated report
-- from the content that references it, never by enumerating the asset table.
CREATE POLICY assets_public_read ON assets.assets
  FOR SELECT TO anon, authenticated
  USING (
    bucket_visibility = 'public'
    OR private.has_permission('asset.manage')
    OR private.has_permission('content.read_draft')
  );
CREATE POLICY assets_write ON assets.assets
  FOR ALL TO authenticated
  USING (private.has_permission('asset.manage') OR private.has_permission('asset.upload'))
  WITH CHECK (private.has_permission('asset.manage') OR private.has_permission('asset.upload'));

CREATE POLICY asset_versions_read ON assets.asset_versions
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (SELECT 1 FROM assets.assets a
             WHERE a.id = asset_versions.asset_id
               AND (a.bucket_visibility = 'public'
                    OR private.has_permission('asset.manage')
                    OR private.has_permission('content.read_draft')))
  );
CREATE POLICY asset_versions_write ON assets.asset_versions
  FOR ALL TO authenticated
  USING (private.has_permission('asset.manage'))
  WITH CHECK (private.has_permission('asset.manage'));

CREATE POLICY content_asset_usages_read ON assets.content_asset_usages
  FOR SELECT TO anon, authenticated
  USING (private.can_read_version(content_version_id));
CREATE POLICY content_asset_usages_write ON assets.content_asset_usages
  FOR ALL TO authenticated
  USING (private.can_write_version(content_version_id))
  WITH CHECK (private.can_write_version(content_version_id));

-- Download policies: the metadata_public flag decides whether a visitor may see that
-- an asset is gated and on what terms. The payload is never reachable from here.
CREATE POLICY download_policies_read ON assets.download_policies
  FOR SELECT TO anon, authenticated
  USING (metadata_public OR private.has_permission('asset.manage_downloads'));
CREATE POLICY download_policies_write ON assets.download_policies
  FOR ALL TO authenticated
  USING (private.has_permission('asset.manage_downloads'))
  WITH CHECK (private.has_permission('asset.manage_downloads'));

-- Entitlements: a user sees their own; managers see all. Nobody grants their own.
CREATE POLICY download_entitlements_read ON assets.download_entitlements
  FOR SELECT TO authenticated
  USING (
    (subject_kind = 'user' AND user_id = auth.uid())
    OR private.has_permission('asset.manage_downloads')
  );
CREATE POLICY download_entitlements_write ON assets.download_entitlements
  FOR ALL TO authenticated
  USING (private.has_permission('asset.manage_downloads'))
  WITH CHECK (private.has_permission('asset.manage_downloads'));

-- Download history: a user sees their own; managers see all. Append-only.
CREATE POLICY download_events_read ON assets.download_events
  FOR SELECT TO authenticated
  USING (actor_id = auth.uid() OR private.has_permission('asset.manage_downloads'));
CREATE POLICY download_events_insert ON assets.download_events
  FOR INSERT TO authenticated, anon WITH CHECK (true);
-- No UPDATE or DELETE policy: the history is append-only.

-- ---------------------------------------------------------------------------
-- Subscriptions. A subscription may exist with NO platform account, so most access
-- flows through the trusted server layer holding an unsubscribe or confirmation
-- token. Through the API, a signed-in user reaches only their own linked records.
-- ---------------------------------------------------------------------------
CREATE POLICY newsletters_read ON subscriptions.newsletters
  FOR SELECT TO anon, authenticated USING (active OR private.has_permission('admin.manage_newsletters'));
CREATE POLICY newsletters_write ON subscriptions.newsletters
  FOR ALL TO authenticated
  USING (private.has_permission('admin.manage_newsletters'))
  WITH CHECK (private.has_permission('admin.manage_newsletters'));

CREATE POLICY subscribers_read_own ON subscriptions.subscribers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_permission('admin.manage_newsletters'));
CREATE POLICY subscribers_update_own ON subscriptions.subscribers
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY subscriptions_read_own ON subscriptions.subscriptions
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM subscriptions.subscribers s
             WHERE s.id = subscriptions.subscriber_id AND s.user_id = auth.uid())
    OR private.has_permission('admin.manage_newsletters')
  );
CREATE POLICY subscriptions_write_own ON subscriptions.subscriptions
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM subscriptions.subscribers s
                  WHERE s.id = subscriptions.subscriber_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM subscriptions.subscribers s
                       WHERE s.id = subscriptions.subscriber_id AND s.user_id = auth.uid()));

CREATE POLICY topic_preferences_read_own ON subscriptions.topic_preferences
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM subscriptions.subscribers s
                  WHERE s.id = topic_preferences.subscriber_id AND s.user_id = auth.uid()));
CREATE POLICY topic_preferences_write_own ON subscriptions.topic_preferences
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM subscriptions.subscribers s
                  WHERE s.id = topic_preferences.subscriber_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM subscriptions.subscribers s
                       WHERE s.id = topic_preferences.subscriber_id AND s.user_id = auth.uid()));

-- Consent evidence is readable by its owner and by newsletter administrators, and is
-- never mutable through the API.
CREATE POLICY consent_events_read ON subscriptions.consent_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM subscriptions.subscribers s
             WHERE s.id = consent_events.subscriber_id AND s.user_id = auth.uid())
    OR private.has_permission('admin.manage_newsletters')
  );

-- Suppression and the delivery queue are operational data: administrators only.
CREATE POLICY suppressions_admin ON subscriptions.suppressions
  FOR SELECT TO authenticated
  USING (private.has_permission('admin.manage_newsletters'));

CREATE POLICY delivery_queue_admin ON subscriptions.delivery_queue
  FOR SELECT TO authenticated
  USING (private.has_permission('admin.manage_newsletters'));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT ON ALL TABLES IN SCHEMA assets TO anon, authenticated;
GRANT INSERT ON assets.download_events TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON assets.assets, assets.asset_versions,
  assets.content_asset_usages, assets.download_policies, assets.download_entitlements,
  assets.buckets TO authenticated;

GRANT SELECT ON subscriptions.newsletters TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA subscriptions TO authenticated;
GRANT UPDATE ON subscriptions.subscribers, subscriptions.subscriptions TO authenticated;
GRANT INSERT, DELETE ON subscriptions.topic_preferences TO authenticated;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA assets, subscriptions TO authenticated;
