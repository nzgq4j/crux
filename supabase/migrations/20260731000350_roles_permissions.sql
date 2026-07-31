-- Block 06 — Role and permission matrix (§45.1.5, §45.2.2, §45.2.3)
-- Reference data, not sample data: the platform is inoperable without it.
-- Reverse: DELETE FROM identity.role_permissions; DELETE FROM identity.permissions;
--          DELETE FROM identity.roles;

-- ---------------------------------------------------------------------------
-- The fourteen roles. Names are exact and load-bearing.
-- ---------------------------------------------------------------------------
INSERT INTO identity.roles (key, name, description, rank) VALUES
  ('registered_user',        'Registered user',        'Holds an account. Reads public content, saves items, manages own profile.', 10),
  ('subscriber',             'Subscriber',             'Registered user with an active newsletter subscription.', 20),
  ('research_member',        'Research member',        'Entitled to gated reports and restricted datasets.', 30),
  ('contributor',            'Contributor',            'May be assigned to a version and edit assigned drafts.', 40),
  ('author',                 'Author',                 'Creates and authors drafts; submits for review.', 50),
  ('reviewer',               'Reviewer',               'Reviews assigned versions against the editorial criteria.', 60),
  ('editor',                 'Editor',                 'Edits any draft, assigns work, requests changes.', 70),
  ('managing_editor',        'Managing editor',        'Approves reviews, manages the editorial calendar, issues corrections.', 80),
  ('publisher',              'Publisher',              'Publishes, schedules, and withdraws content.', 90),
  ('taxonomy_manager',       'Taxonomy manager',       'Governs vocabularies, terms, merges and deprecations.', 60),
  ('asset_manager',          'Asset manager',          'Manages assets, licensing, and download policies.', 60),
  ('analytics_viewer',       'Analytics viewer',       'Reads analytics and editorial performance reporting.', 40),
  ('user_administrator',     'User administrator',     'Manages accounts and role assignment.', 95),
  ('platform_administrator', 'Platform administrator', 'Full administrative authority including settings and audit.', 100)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Permissions across the four §45.2.3 action families:
-- content, taxonomy, asset, admin.
-- ---------------------------------------------------------------------------
INSERT INTO identity.permissions (key, resource, action, description) VALUES
  -- content
  ('content.read_draft',      'content',  'read_draft',      'Read draft and in-review content'),
  ('content.create',          'content',  'create',          'Create a content item and its first draft'),
  ('content.edit_assigned',   'content',  'edit_assigned',   'Edit a draft the user is assigned to'),
  ('content.edit_any',        'content',  'edit_any',        'Edit any draft'),
  ('content.submit_review',   'content',  'submit_review',   'Submit a draft for review'),
  ('content.review',          'content',  'review',          'Record a review on an assigned version'),
  ('content.approve',         'content',  'approve',         'Approve a reviewed version'),
  ('content.publish',         'content',  'publish',         'Publish or schedule a version'),
  ('content.correct',         'content',  'correct',         'Issue a correction'),
  ('content.withdraw',        'content',  'withdraw',        'Withdraw published content'),
  ('content.assign',          'content',  'assign',          'Assign editorial work'),
  -- taxonomy
  ('taxonomy.read',           'taxonomy', 'read',            'Read the controlled vocabularies'),
  ('taxonomy.manage_terms',   'taxonomy', 'manage_terms',    'Create, edit and deprecate terms'),
  ('taxonomy.merge_terms',    'taxonomy', 'merge_terms',     'Merge terms and create redirects'),
  -- asset
  ('asset.upload',            'asset',    'upload',          'Upload an asset'),
  ('asset.manage',            'asset',    'manage',          'Manage asset metadata, versions and licensing'),
  ('asset.manage_downloads',  'asset',    'manage_downloads','Manage download policies and entitlements'),
  ('asset.download_gated',    'asset',    'download_gated',  'Download gated reports and datasets'),
  -- admin
  ('admin.access',            'admin',    'access',          'Reach the administrative application'),
  ('admin.read_analytics',    'admin',    'read_analytics',  'Read analytics and reporting'),
  ('admin.read_audit',        'admin',    'read_audit',      'Read the audit log'),
  ('admin.manage_users',      'admin',    'manage_users',    'Manage accounts and assign roles'),
  ('admin.manage_newsletters','admin',    'manage_newsletters','Manage newsletters and suppression'),
  ('admin.manage_search',     'admin',    'manage_search',   'Manage synonyms, boosts and suppressions'),
  ('admin.manage_redirects',  'admin',    'manage_redirects','Manage redirects'),
  ('admin.manage_settings',   'admin',    'manage_settings', 'Manage platform settings')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Role → permission matrix. Least privilege: each role receives only what its
-- documented responsibilities require.
-- ---------------------------------------------------------------------------
INSERT INTO identity.role_permissions (role_key, permission_key) VALUES
  ('research_member',        'asset.download_gated'),

  ('contributor',            'content.read_draft'),
  ('contributor',            'content.edit_assigned'),
  ('contributor',            'taxonomy.read'),

  ('author',                 'content.read_draft'),
  ('author',                 'content.create'),
  ('author',                 'content.edit_assigned'),
  ('author',                 'content.submit_review'),
  ('author',                 'asset.upload'),
  ('author',                 'taxonomy.read'),
  ('author',                 'admin.access'),

  ('reviewer',               'content.read_draft'),
  ('reviewer',               'content.review'),
  ('reviewer',               'taxonomy.read'),
  ('reviewer',               'admin.access'),

  ('editor',                 'content.read_draft'),
  ('editor',                 'content.create'),
  ('editor',                 'content.edit_any'),
  ('editor',                 'content.submit_review'),
  ('editor',                 'content.assign'),
  ('editor',                 'asset.upload'),
  ('editor',                 'taxonomy.read'),
  ('editor',                 'admin.access'),

  ('managing_editor',        'content.read_draft'),
  ('managing_editor',        'content.edit_any'),
  ('managing_editor',        'content.assign'),
  ('managing_editor',        'content.approve'),
  ('managing_editor',        'content.correct'),
  ('managing_editor',        'content.withdraw'),
  ('managing_editor',        'taxonomy.read'),
  ('managing_editor',        'admin.access'),

  ('publisher',              'content.read_draft'),
  ('publisher',              'content.publish'),
  ('publisher',              'content.withdraw'),
  ('publisher',              'taxonomy.read'),
  ('publisher',              'admin.access'),

  ('taxonomy_manager',       'taxonomy.read'),
  ('taxonomy_manager',       'taxonomy.manage_terms'),
  ('taxonomy_manager',       'taxonomy.merge_terms'),
  ('taxonomy_manager',       'admin.access'),

  ('asset_manager',          'asset.upload'),
  ('asset_manager',          'asset.manage'),
  ('asset_manager',          'asset.manage_downloads'),
  ('asset_manager',          'admin.access'),

  ('analytics_viewer',       'admin.access'),
  ('analytics_viewer',       'admin.read_analytics'),

  ('user_administrator',     'admin.access'),
  ('user_administrator',     'admin.manage_users'),
  ('user_administrator',     'admin.read_audit'),

  ('platform_administrator', 'admin.access'),
  ('platform_administrator', 'admin.read_analytics'),
  ('platform_administrator', 'admin.read_audit'),
  ('platform_administrator', 'admin.manage_users'),
  ('platform_administrator', 'admin.manage_newsletters'),
  ('platform_administrator', 'admin.manage_search'),
  ('platform_administrator', 'admin.manage_redirects'),
  ('platform_administrator', 'admin.manage_settings'),
  ('platform_administrator', 'taxonomy.read'),
  ('platform_administrator', 'content.read_draft')
ON CONFLICT DO NOTHING;

-- NOTE ON SEPARATION OF DUTIES (§45.1.5):
-- `publisher` deliberately does NOT hold content.edit_any or content.approve, and
-- `managing_editor` deliberately does NOT hold content.publish. Neither role can
-- carry a version from authorship to publication alone. `platform_administrator`
-- likewise holds no content.publish or content.approve: administrative authority is
-- not editorial authority. The per-version constraints (an author may not review or
-- publish their own work) are enforced separately by the workflow triggers, because
-- role permissions alone cannot express them.
