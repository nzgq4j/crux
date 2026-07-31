-- Crux demonstration seed (Block 04, master prompt §29)
--
-- ALL CONTENT HERE IS FICTIONAL DEMONSTRATION MATERIAL.
-- Every organisation, person, figure and finding is invented. Nothing in this file
-- describes a real client, a real research result, or a real endorsement. Figures
-- are internally consistent illustrations, not measurements. This is deliberate:
-- rules/content-modeling.md 24 forbids fabricating research claims that could be
-- mistaken for real ones, so the demonstration corpus is labelled as such and every
-- seeded expert carries a fictional affiliation.
--
-- Idempotent: safe to run repeatedly. Deterministic: no random values, no now()
-- where a stable date matters.

BEGIN;

-- ---------------------------------------------------------------------------
-- Content types
-- ---------------------------------------------------------------------------
INSERT INTO cms.content_types (key, name, description, requires_methodology, requires_limitations, minimum_evidence_standard) VALUES
  ('report',      'Research report', 'Long-form primary research with methodology and findings.', true,  true,  'mandatory'),
  ('white_paper', 'White paper',     'Problem-led analysis with a recommended approach.',         true,  true,  'mandatory'),
  ('brief',       'Research brief',  'Short decision-oriented analysis.',                          false, true,  'recommended'),
  ('article',     'Article',         'Editorial analysis and commentary.',                         false, false, 'recommended'),
  ('case_study',  'Case study',      'An anonymised account of an intervention and its outcome.',  false, true,  'recommended'),
  ('data_story',  'Data story',      'A single finding presented through a chart.',                true,  true,  'mandatory'),
  ('collection',  'Collection',      'A curated, editorially ordered set of related work.',        false, false, 'optional'),
  ('page',        'Page',            'A static organisational page.',                              false, false, 'optional')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  minimum_evidence_standard = EXCLUDED.minimum_evidence_standard;

-- ---------------------------------------------------------------------------
-- Module catalogue
-- ---------------------------------------------------------------------------
INSERT INTO cms.content_modules (key, name, description, is_visual, json_schema) VALUES
  ('heading',      'Heading',           'A section heading.',                    false, '{"type":"object","required":["heading","level"]}'),
  ('prose',        'Prose',             'A paragraph of body text.',             false, '{"type":"object","required":["text"]}'),
  ('list',         'List',              'An ordered or unordered list.',         false, '{"type":"object","required":["items"]}'),
  ('quote',        'Pull quote',        'An attributed quotation.',              false, '{"type":"object","required":["text"]}'),
  ('key_findings', 'Key findings',      'The headline findings of the work.',    false, '{"type":"object","required":["items"]}'),
  ('statistic',    'Statistic callout', 'A single figure with its basis.',       false, '{"type":"object","required":["value","label"]}'),
  ('figure',       'Figure',            'An image with required alternative text.', true, '{"type":"object","required":["asset","alt","caption"]}'),
  ('table',        'Table',             'A data table with headers and caption.',  true, '{"type":"object","required":["headers","rows","caption"]}'),
  ('chart',        'Chart',             'A chart with a required text alternative.', true, '{"type":"object","required":["series","alt","caption"]}'),
  ('methodology',  'Methodology note',  'How the work was carried out.',         false, '{"type":"object","required":["text"]}'),
  ('limitations',  'Limitations',       'What the work does not establish.',     false, '{"type":"object","required":["text"]}'),
  ('recommendation','Recommendations',  'Recommended actions for leaders.',      false, '{"type":"object","required":["items"]}'),
  ('callout',      'Callout',           'An aside or note.',                     false, '{"type":"object","required":["text"]}'),
  ('references',   'References',        'The source list for the work.',         false, '{"type":"object"}')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Taxonomy: industries, capabilities, executive roles, topics
-- ---------------------------------------------------------------------------
INSERT INTO taxonomy.vocabularies (key, name, description, is_closed) VALUES
  ('industry',   'Industries',      'Sectors the organisation researches.', true),
  ('capability', 'Capabilities',    'Cross-cutting capability areas.',       true),
  ('role',       'Executive roles', 'Audience roles content is written for.', true),
  ('topic',      'Topics',          'Hierarchical subject taxonomy.',        false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO taxonomy.terms (vocabulary_id, slug, name, description)
SELECT v.id, t.slug, t.name, t.description
FROM taxonomy.vocabularies v
CROSS JOIN (VALUES
  ('aerospace-defence',      'Aerospace and defence',      'Defence primes, space, and adjacent supply chains.'),
  ('automotive-mobility',    'Automotive and mobility',    'Vehicle manufacture, electrification, and mobility services.'),
  ('banking-capital-markets','Banking and capital markets','Retail and institutional banking, exchanges, and market infrastructure.'),
  ('energy-utilities',       'Energy and utilities',       'Generation, networks, and the energy transition.'),
  ('government-public',      'Government and public sector','National and local government and public service delivery.'),
  ('healthcare',             'Healthcare',                 'Providers, payers, and health systems.'),
  ('industrial-manufacturing','Industrial manufacturing',  'Discrete and process manufacturing.'),
  ('technology',             'Technology',                 'Software, semiconductors, and technology services.')
) AS t(slug, name, description)
WHERE v.key = 'industry'
ON CONFLICT (vocabulary_id, slug) DO NOTHING;

INSERT INTO taxonomy.terms (vocabulary_id, slug, name, description)
SELECT v.id, t.slug, t.name, t.description
FROM taxonomy.vocabularies v
CROSS JOIN (VALUES
  ('artificial-intelligence', 'Artificial intelligence',  'Applied AI, governance, and adoption.'),
  ('cybersecurity',           'Cybersecurity',            'Security strategy, resilience, and operations.'),
  ('data-analytics',          'Data and analytics',       'Data platforms, quality, and analytical capability.'),
  ('digital-strategy',        'Digital strategy',         'Digital operating models and portfolio choices.'),
  ('operations',              'Operations',               'Process, supply chain, and operational performance.'),
  ('organisation-leadership', 'Organisation and leadership','Structure, culture, and leadership capability.'),
  ('risk-resilience',         'Risk and resilience',      'Enterprise risk, continuity, and resilience.'),
  ('sustainability',          'Sustainability',           'Decarbonisation, reporting, and transition planning.'),
  ('technology-modernisation','Technology modernisation', 'Legacy estate renewal and platform migration.'),
  ('workforce',               'Workforce',                'Skills, talent, and the changing shape of work.')
) AS t(slug, name, description)
WHERE v.key = 'capability'
ON CONFLICT (vocabulary_id, slug) DO NOTHING;

INSERT INTO taxonomy.terms (vocabulary_id, slug, name, description)
SELECT v.id, t.slug, t.name, t.description
FROM taxonomy.vocabularies v
CROSS JOIN (VALUES
  ('chief-executive',        'Chief executive officer',        'Enterprise strategy and portfolio decisions.'),
  ('chief-financial',        'Chief financial officer',        'Capital allocation and financial risk.'),
  ('chief-information',      'Chief information officer',      'Technology estate and delivery.'),
  ('chief-technology',       'Chief technology officer',       'Architecture and engineering capability.'),
  ('chief-information-security','Chief information security officer','Security posture and assurance.'),
  ('public-sector-leader',   'Public sector leader',           'Public service outcomes and accountability.')
) AS t(slug, name, description)
WHERE v.key = 'role'
ON CONFLICT (vocabulary_id, slug) DO NOTHING;

-- Topic hierarchy: two broader topics with narrower children.
INSERT INTO taxonomy.terms (vocabulary_id, slug, name, description)
SELECT v.id, t.slug, t.name, t.description
FROM taxonomy.vocabularies v
CROSS JOIN (VALUES
  ('ai-governance',        'AI governance',          'Oversight, assurance and accountability for AI systems.'),
  ('model-risk',           'Model risk',             'Validation and monitoring of deployed models.'),
  ('procurement-of-ai',    'Procurement of AI',      'Buying, evaluating and contracting for AI capability.'),
  ('operational-resilience','Operational resilience','Withstanding and recovering from disruption.'),
  ('third-party-risk',     'Third-party risk',       'Dependency on suppliers and service providers.')
) AS t(slug, name, description)
WHERE v.key = 'topic'
ON CONFLICT (vocabulary_id, slug) DO NOTHING;

INSERT INTO taxonomy.term_relationships (broader_id, narrower_id)
SELECT b.id, n.id
FROM taxonomy.terms b, taxonomy.terms n
WHERE (b.slug, n.slug) IN (
  ('ai-governance', 'model-risk'),
  ('ai-governance', 'procurement-of-ai'),
  ('operational-resilience', 'third-party-risk')
)
ON CONFLICT DO NOTHING;

INSERT INTO taxonomy.synonyms (term_id, synonym)
SELECT t.id, s.synonym FROM taxonomy.terms t
JOIN (VALUES
  ('artificial-intelligence', 'AI'),
  ('artificial-intelligence', 'machine learning'),
  ('cybersecurity',           'infosec'),
  ('cybersecurity',           'information security'),
  ('operational-resilience',  'business continuity')
) AS s(slug, synonym) ON s.slug = t.slug
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Organisation and experts — all fictional
-- ---------------------------------------------------------------------------
INSERT INTO identity.organisations (slug, name, url) VALUES
  ('crucible-insight', 'Crucible Insight', 'https://example.org/crucible-insight')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO identity.people (slug, display_name, given_name, family_name) VALUES
  ('h-okonkwo',   'Dr Helen Okonkwo',  'Helen',  'Okonkwo'),
  ('m-lindqvist', 'Mats Lindqvist',    'Mats',   'Lindqvist'),
  ('p-raman',     'Priya Raman',       'Priya',  'Raman'),
  ('t-ashford',   'Dr Tomas Ashford',  'Tomas',  'Ashford'),
  ('j-mwangi',    'Joyce Mwangi',      'Joyce',  'Mwangi'),
  ('r-delacroix', 'Renaud Delacroix',  'Renaud', 'Delacroix'),
  ('s-yamada',    'Dr Sena Yamada',    'Sena',   'Yamada'),
  ('a-brennan',   'Aoife Brennan',     'Aoife',  'Brennan')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO identity.expert_profiles (person_id, organisation_id, job_title, biography, disclosures, published_at)
SELECT p.id, o.id, e.job_title, e.biography, e.disclosures, TIMESTAMPTZ '2026-01-15 09:00:00+00'
FROM identity.people p
JOIN identity.organisations o ON o.slug = 'crucible-insight'
JOIN (VALUES
  ('h-okonkwo',   'Director of Research',        'Leads the AI governance programme. Fictional profile for demonstration.', 'No external funding to disclose.'),
  ('m-lindqvist', 'Principal Analyst, Energy',   'Covers grid investment and transition planning. Fictional profile.',      'No external funding to disclose.'),
  ('p-raman',     'Head of Data Science',        'Leads quantitative methods and survey design. Fictional profile.',        'No external funding to disclose.'),
  ('t-ashford',   'Senior Fellow, Public Policy','Researches public service delivery. Fictional profile.',                  'Unpaid advisory role, fictional body.'),
  ('j-mwangi',    'Principal Analyst, Security', 'Covers operational resilience and third-party risk. Fictional profile.',  'No external funding to disclose.'),
  ('r-delacroix', 'Editor',                      'Editorial standards and corrections. Fictional profile.',                 'No external funding to disclose.'),
  ('s-yamada',    'Research Lead, Health',       'Health systems and workforce research. Fictional profile.',               'No external funding to disclose.'),
  ('a-brennan',   'Analyst, Manufacturing',      'Industrial operations and supply chains. Fictional profile.',             'No external funding to disclose.')
) AS e(slug, job_title, biography, disclosures) ON e.slug = p.slug
ON CONFLICT (person_id) DO NOTHING;

INSERT INTO identity.external_identifiers (scheme, identifier, person_id)
SELECT 'orcid', v.identifier, p.id
FROM identity.people p
JOIN (VALUES
  ('h-okonkwo', '0000-0002-0000-0001'),
  ('p-raman',   '0000-0002-0000-0002'),
  ('t-ashford', '0000-0002-0000-0003'),
  ('s-yamada',  '0000-0002-0000-0004')
) AS v(slug, identifier) ON v.slug = p.slug
ON CONFLICT (scheme, identifier) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Newsletters
-- ---------------------------------------------------------------------------
-- `audience` is a controlled access tier, not free text (see the check constraint).
INSERT INTO subscriptions.newsletters (slug, name, description, cadence, audience, active) VALUES
  ('crux-weekly',      'Crux Weekly',        'The week''s published research in one email.',              'weekly',    'public',          true),
  ('ai-governance',    'AI Governance Brief','Governance, assurance and procurement of AI systems.',      'monthly',   'public',          true),
  ('energy-transition','Energy Transition',  'Grid investment, decarbonisation and transition planning.', 'monthly',   'registered',      true),
  ('public-sector',    'Public Sector Note', 'Research for public service leaders.',                      'quarterly', 'subscriber_tier', true)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Demonstration content
--
-- Each item gets: an item row, a version, structured modules, contributors, and
-- taxonomy assignments. Published items go through the same trigger path as real
-- content, so their derived text and immutability behave identically.
-- ---------------------------------------------------------------------------
DO $seed$
DECLARE
  spec        record;
  v_item      uuid;
  v_version   uuid;
  v_author    uuid;
  v_pos       int;
  v_published timestamptz;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      -- (slug, type, title, standfirst, author_slug, industry, capability, days_ago)
      ('grid-investment-outlook-2026','report','Grid Investment Outlook 2026','Network operators face a decade of concurrent replacement and expansion. Where the constraint actually binds.','m-lindqvist','energy-utilities','sustainability',6),
      ('ai-assurance-in-regulated-sectors','report','AI Assurance in Regulated Sectors','What supervisory expectations mean for model validation practice.','h-okonkwo','banking-capital-markets','artificial-intelligence',13),
      ('resilience-after-concentration','report','Resilience After Concentration','Third-party concentration has outpaced the controls designed for it.','j-mwangi','technology','risk-resilience',21),
      ('workforce-capability-gap','report','The Workforce Capability Gap','Hiring has not closed the gap. Capability building might.','s-yamada','healthcare','workforce',34),
      ('manufacturing-data-foundations','report','Manufacturing Data Foundations','Why analytics programmes stall before they reach the shop floor.','a-brennan','industrial-manufacturing','data-analytics',48),
      ('public-service-delivery-models','report','Public Service Delivery Models','Comparing delivery structures against outcome and cost evidence.','t-ashford','government-public','operations',62),

      ('procuring-ai-responsibly','white_paper','Procuring AI Responsibly','A contracting and evaluation approach for AI capability.','h-okonkwo','government-public','artificial-intelligence',9),
      ('modernising-the-core','white_paper','Modernising the Core','Sequencing legacy renewal without pausing the business.','p-raman','banking-capital-markets','technology-modernisation',27),
      ('resilience-by-design','white_paper','Resilience by Design','Building continuity into architecture rather than bolting it on.','j-mwangi','technology','risk-resilience',41),
      ('transition-planning-that-holds','white_paper','Transition Planning That Holds','Making decarbonisation plans survive contact with capital committees.','m-lindqvist','energy-utilities','sustainability',55),

      ('what-model-risk-teams-ask','brief','What Model Risk Teams Actually Ask','Five questions that decide whether a model reaches production.','h-okonkwo','banking-capital-markets','artificial-intelligence',3),
      ('supplier-concentration-signals','brief','Supplier Concentration Signals','Three indicators that concentration risk is building.','j-mwangi','technology','risk-resilience',17),
      ('capital-sequencing-under-uncertainty','brief','Capital Sequencing Under Uncertainty','How energy boards are staging irreversible commitments.','m-lindqvist','energy-utilities','risk-resilience',30),
      ('data-quality-before-analytics','brief','Data Quality Before Analytics','The precondition most programmes skip.','a-brennan','industrial-manufacturing','data-analytics',44),

      ('anonymised-grid-operator','case_study','Rebuilding an Asset Register','An anonymised network operator rebuilt its asset data before investing in analytics.','m-lindqvist','energy-utilities','data-analytics',11),
      ('anonymised-health-provider','case_study','Rostering Under Constraint','An anonymised provider restructured rostering against a fixed workforce.','s-yamada','healthcare','operations',25),
      ('anonymised-manufacturer','case_study','A Maintenance Programme That Stuck','An anonymised manufacturer moved from reactive to planned maintenance.','a-brennan','industrial-manufacturing','operations',39),

      ('where-ai-budgets-went','data_story','Where AI Budgets Went','Illustrative allocation across the adoption lifecycle.','p-raman','technology','artificial-intelligence',5),
      ('outage-duration-distribution','data_story','The Shape of Outage Duration','Illustrative distribution of incident duration by cause.','j-mwangi','technology','risk-resilience',19),

      ('the-assurance-gap','article','The Assurance Gap','Governance frameworks describe controls that few organisations can evidence.','h-okonkwo','banking-capital-markets','artificial-intelligence',2),
      ('beyond-the-pilot','article','Beyond the Pilot','Why pilots succeed and programmes fail.','p-raman','technology','digital-strategy',4),
      ('the-cost-of-deferral','article','The Cost of Deferral','Deferred replacement is a decision with a price.','m-lindqvist','energy-utilities','risk-resilience',8),
      ('what-boards-ask-about-ai','article','What Boards Ask About AI','The questions that come up, and the evidence that answers them.','h-okonkwo','banking-capital-markets','organisation-leadership',12),
      ('resilience-is-not-redundancy','article','Resilience Is Not Redundancy','Duplicating a dependency does not remove it.','j-mwangi','technology','risk-resilience',16),
      ('measuring-what-matters','article','Measuring What Matters','Choosing metrics that survive scrutiny.','p-raman','technology','data-analytics',20),
      ('the-skills-that-transfer','article','The Skills That Transfer','Which capabilities move across a modernisation programme.','s-yamada','healthcare','workforce',24),
      ('procurement-as-policy','article','Procurement as Policy','Buying decisions encode policy whether or not that is intended.','t-ashford','government-public','digital-strategy',28),
      ('supply-chain-visibility','article','Supply Chain Visibility','Visibility is necessary and nowhere near sufficient.','a-brennan','industrial-manufacturing','operations',32),
      ('the-maintenance-backlog','article','The Maintenance Backlog','Deferred maintenance compounds in ways budgets do not show.','a-brennan','industrial-manufacturing','operations',36),
      ('governing-third-parties','article','Governing Third Parties','Contractual control and operational control are different things.','j-mwangi','technology','risk-resilience',40),
      ('evidence-standards-in-policy','article','Evidence Standards in Policy','What counts as evidence when the decision cannot wait.','t-ashford','government-public','organisation-leadership',45),
      ('after-the-transition-plan','article','After the Transition Plan','Execution is where transition plans meet their constraints.','m-lindqvist','energy-utilities','sustainability',50)
    ) AS s(slug, ctype, title, standfirst, author_slug, industry, capability, days_ago)
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM cms.content_items WHERE canonical_slug = spec.slug);

    v_published := TIMESTAMPTZ '2026-07-31 09:00:00+00' - (spec.days_ago || ' days')::interval;
    SELECT id INTO v_author FROM identity.people WHERE slug = spec.author_slug;

    INSERT INTO cms.content_items (content_type_key, canonical_slug, lifecycle_state)
    VALUES (spec.ctype, spec.slug, 'published')
    RETURNING id INTO v_item;

    INSERT INTO cms.content_versions
      (content_item_id, version_number, title, standfirst, executive_summary, methodology, limitations, status)
    VALUES (
      v_item, 1, spec.title, spec.standfirst,
      'This demonstration item illustrates the structured publication format. ' ||
      'Figures are illustrative and internally consistent; they are not measurements.',
      CASE WHEN spec.ctype IN ('report','white_paper','data_story')
        THEN 'Illustrative methodology: a fictional survey of 480 senior leaders conducted for demonstration purposes, supplemented by fictional interview material. No real respondents were surveyed.'
        ELSE NULL END,
      CASE WHEN spec.ctype IN ('report','white_paper','brief','case_study','data_story')
        THEN 'This is demonstration content. It establishes nothing about the real world and must not be cited as evidence.'
        ELSE NULL END,
      'draft')
    RETURNING id INTO v_version;

    v_pos := 0;
    INSERT INTO cms.content_version_modules (version_id, module_key, position, fragment_id, payload) VALUES
      (v_version, 'key_findings', v_pos, 'key-findings', jsonb_build_object(
        'items', jsonb_build_array(
          'The constraint is rarely the one leaders name first.',
          'Evidence quality varies more than capability does.',
          'Sequencing decides outcomes more often than budget does.'))),
      (v_version, 'heading', v_pos + 1, 'sec-context', jsonb_build_object('heading','Context','level',2)),
      (v_version, 'prose',   v_pos + 2, 'sec-context-body', jsonb_build_object(
        'text','Demonstration body text establishing the problem and why it matters to the reader. Evidence is presented before interpretation, and interpretation before recommendation.')),
      (v_version, 'heading', v_pos + 3, 'sec-evidence', jsonb_build_object('heading','Evidence','level',2)),
      (v_version, 'prose',   v_pos + 4, 'sec-evidence-body', jsonb_build_object(
        'text','Illustrative evidence drawn from the fictional survey described in the methodology note. Every figure below is invented for demonstration.')),
      (v_version, 'statistic', v_pos + 5, 'stat-primary', jsonb_build_object(
        'value','61%','label','of fictional respondents reported the constraint was organisational rather than technical','basis','Illustrative figure')),
      (v_version, 'heading', v_pos + 6, 'sec-analysis', jsonb_build_object('heading','Analysis','level',2)),
      (v_version, 'prose',   v_pos + 7, 'sec-analysis-body', jsonb_build_object(
        'text','Interpretation of the evidence above, kept explicitly separate from the evidence itself so a reader can disagree with the reading without disputing the data.')),
      (v_version, 'recommendation', v_pos + 8, 'sec-recommendations', jsonb_build_object(
        'items', jsonb_build_array(
          'Establish the evidence baseline before committing capital.',
          'Sequence irreversible decisions behind reversible ones.',
          'Assign a named owner for the constraint, not for the programme.')));

    INSERT INTO cms.content_contributors (version_id, person_id, role, affiliation, position)
    VALUES (v_version, v_author, 'author', 'Crucible Insight', 0);

    INSERT INTO taxonomy.content_terms (content_item_id, term_id)
    SELECT v_item, t.id FROM taxonomy.terms t WHERE t.slug IN (spec.industry, spec.capability)
    ON CONFLICT DO NOTHING;

    UPDATE cms.content_versions
       SET status = 'published', published_at = v_published
     WHERE id = v_version;

    UPDATE cms.content_items SET current_version_id = v_version WHERE id = v_item;
  END LOOP;
END
$seed$;

-- ---------------------------------------------------------------------------
-- Collections
-- ---------------------------------------------------------------------------
DO $collections$
DECLARE
  c        record;
  v_item   uuid;
  v_version uuid;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('ai-governance-programme','The AI Governance Programme','Our continuing work on assurance, procurement and model risk.'),
      ('energy-transition-2026','Energy Transition 2026','Grid investment, capital sequencing and transition planning.'),
      ('resilience-agenda','The Resilience Agenda','Concentration, third parties, and operational continuity.')
    ) AS s(slug, title, standfirst)
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM cms.content_items WHERE canonical_slug = c.slug);

    INSERT INTO cms.content_items (content_type_key, canonical_slug, lifecycle_state)
    VALUES ('collection', c.slug, 'published') RETURNING id INTO v_item;

    INSERT INTO cms.content_versions (content_item_id, version_number, title, standfirst, status)
    VALUES (v_item, 1, c.title, c.standfirst, 'draft') RETURNING id INTO v_version;

    INSERT INTO cms.content_version_modules (version_id, module_key, position, fragment_id, payload)
    VALUES (v_version, 'prose', 0, 'intro', jsonb_build_object('text', c.standfirst));

    UPDATE cms.content_versions SET status='published', published_at = TIMESTAMPTZ '2026-07-20 09:00:00+00' WHERE id = v_version;
    UPDATE cms.content_items SET current_version_id = v_version WHERE id = v_item;
  END LOOP;
END
$collections$;

-- Editorially ordered collection membership (not date-ordered).
INSERT INTO cms.content_relationships (from_item_id, to_item_id, relationship, position)
SELECT col.id, mem.id, 'part_of_collection', v.position
FROM cms.content_items col
JOIN (VALUES
  ('ai-governance-programme','ai-assurance-in-regulated-sectors',0),
  ('ai-governance-programme','procuring-ai-responsibly',1),
  ('ai-governance-programme','what-model-risk-teams-ask',2),
  ('ai-governance-programme','the-assurance-gap',3),
  ('energy-transition-2026','grid-investment-outlook-2026',0),
  ('energy-transition-2026','transition-planning-that-holds',1),
  ('energy-transition-2026','capital-sequencing-under-uncertainty',2),
  ('resilience-agenda','resilience-after-concentration',0),
  ('resilience-agenda','resilience-by-design',1),
  ('resilience-agenda','supplier-concentration-signals',2)
) AS v(collection_slug, member_slug, position) ON v.collection_slug = col.canonical_slug
JOIN cms.content_items mem ON mem.canonical_slug = v.member_slug
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- One draft item, so draft isolation is demonstrable in a running instance.
-- ---------------------------------------------------------------------------
DO $draft$
DECLARE v_item uuid; v_version uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cms.content_items WHERE canonical_slug = 'unreleased-sector-analysis') THEN
    INSERT INTO cms.content_items (content_type_key, canonical_slug, lifecycle_state)
    VALUES ('report','unreleased-sector-analysis','draft') RETURNING id INTO v_item;

    INSERT INTO cms.content_versions (content_item_id, version_number, title, standfirst, status)
    VALUES (v_item, 1, 'Unreleased Sector Analysis',
            'This draft must never be visible to an anonymous visitor.', 'draft')
    RETURNING id INTO v_version;

    INSERT INTO cms.content_version_modules (version_id, module_key, position, fragment_id, payload)
    VALUES (v_version, 'prose', 0, 'sec-1',
            jsonb_build_object('text','DRAFT ONLY — this string appearing on a public page is a security defect.'));
  END IF;
END
$draft$;

COMMIT;

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------
DO $summary$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT content_type_key AS k, count(*) AS n
      FROM cms.content_items GROUP BY 1 ORDER BY 1
  LOOP
    RAISE NOTICE 'seeded % : %', rpad(r.k, 12), r.n;
  END LOOP;
END
$summary$;
