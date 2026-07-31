#!/usr/bin/env node
/**
 * Corpus ingestion for a single .docx research document.
 *
 * Reads the OOXML package directly and writes a draft content item, version,
 * ordered modules, sources and claims. It does **not** publish: publication is a
 * workflow transition performed by an authorised actor through
 * `workflow.perform_transition`, and an importer that could publish would be a second
 * path around the gates.
 *
 * ## What this program will not do
 *
 * It never invents a value. Where the document is silent — a publication day, an
 * author, an access date, a table caption — the field is left null and reported in the
 * summary as absent (rules/content-modeling.md 25). The counts it prints at the end are
 * the honest measure of how much a human still has to supply.
 *
 * ## Structural mapping
 *
 * The mapping from Word constructs to modules is the judgement recorded in
 * docs/corpus/05-rendering-recommendations.md §5.3, and it is not mechanical:
 *
 *   Heading1/2/3 paragraph        -> heading module at the matching level
 *   Body paragraph                -> prose module
 *   1x1 table whose label matches -> key_findings when the label announces findings,
 *   a findings pattern               otherwise callout with the label preserved
 *   multi-row table               -> table module (caption REQUIRED, and absent from
 *                                    every document in the corpus, so it is reported
 *                                    rather than guessed)
 *   front-matter furniture        -> not a module; mapped to version fields
 *
 * Usage:
 *   node scripts/corpus/ingest.mjs --source <file.docx> --plan <plan.json> [--dry-run]
 */

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'
import pg from 'pg'

// ---------------------------------------------------------------------------
// Minimal OOXML reading. No third-party Word library, and no new dependency: the
// package is a zip, `unzip` is present on every platform this runs on, and every
// field reported below is traceable to a byte in the package rather than to a
// parser's interpretation of it.
//
// The cost is a process spawn per document, which is irrelevant at corpus scale.
// ---------------------------------------------------------------------------

function readDocx(path) {
  return execFileSync('unzip', ['-p', path, 'word/document.xml'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
}

/** Text content of an element, concatenating every <w:t>. */
function textOf(fragment) {
  const out = []
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g
  let m
  while ((m = re.exec(fragment)) !== null) out.push(decode(m[1]))
  return out.join('')
}

function decode(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
}

/**
 * The document body as an ordered sequence of blocks.
 *
 * Top-level `<w:p>` and `<w:tbl>` only — a paragraph nested inside a table cell
 * belongs to the table, not to the body, and counting it twice would duplicate the
 * text into both a table module and a prose module.
 */
function blocks(xml) {
  const body = xml.slice(xml.indexOf(`<w:body>`), xml.lastIndexOf('</w:body>'))
  const out = []
  const re = /<w:(p|tbl)(?:\s[^>]*)?>([\s\S]*?)<\/w:\1>/g
  let m
  let depth = 0
  // Walk top-level children by tracking nesting rather than trusting the regex.
  const tokens = body.split(/(<w:tbl[\s>]|<\/w:tbl>)/)
  void tokens
  void depth
  void re
  void m

  // Simple scanner: find top-level <w:p> and <w:tbl> by bracket matching.
  let i = 0
  while (i < body.length) {
    const nextP = body.indexOf('<w:p ', i)
    const nextP2 = body.indexOf('<w:p>', i)
    const nextT = body.indexOf('<w:tbl ', i)
    const nextT2 = body.indexOf('<w:tbl>', i)
    const candidates = [nextP, nextP2, nextT, nextT2].filter((x) => x >= 0)
    if (candidates.length === 0) break
    const start = Math.min(...candidates)
    const isTable = start === nextT || start === nextT2
    const tag = isTable ? 'w:tbl' : 'w:p'
    const end = matchingClose(body, start, tag)
    if (end < 0) break
    const fragment = body.slice(start, end)
    out.push({ kind: isTable ? 'table' : 'paragraph', xml: fragment })
    i = end
  }
  return out
}

/** Index just past the matching close tag for the element starting at `start`. */
function matchingClose(s, start, tag) {
  const open = new RegExp(`<${tag}[\\s>]`, 'g')
  const close = new RegExp(`</${tag}>`, 'g')
  open.lastIndex = start + 1
  close.lastIndex = start + 1
  let depth = 1
  while (depth > 0) {
    const o = open.exec(s)
    const c = close.exec(s)
    if (!c) return -1
    if (o && o.index < c.index) {
      depth += 1
      close.lastIndex = c.index
      continue
    }
    depth -= 1
    if (depth === 0) return c.index + `</${tag}>`.length
    open.lastIndex = c.index
  }
  return -1
}

function paragraphStyle(fragment) {
  const m = fragment.match(/<w:pStyle\s+w:val="([^"]+)"/)
  return m ? m[1] : null
}

function headingLevel(style) {
  if (!style) return null
  const m = /^Heading(\d)$/.exec(style)
  return m ? Number(m[1]) : null
}

/** Rows of a table as arrays of cell text. */
function tableRows(fragment) {
  const rows = []
  let i = 0
  while (i < fragment.length) {
    const start = fragment.indexOf('<w:tr', i)
    if (start < 0) break
    const end = matchingClose(fragment, start, 'w:tr')
    if (end < 0) break
    const rowXml = fragment.slice(start, end)
    const cells = []
    let j = 0
    while (j < rowXml.length) {
      const cs = rowXml.indexOf('<w:tc', j)
      if (cs < 0) break
      const ce = matchingClose(rowXml, cs, 'w:tc')
      if (ce < 0) break
      cells.push(textOf(rowXml.slice(cs, ce)).trim())
      j = ce
    }
    rows.push(cells)
    i = end
  }
  return rows
}

// ---------------------------------------------------------------------------
// Module construction
// ---------------------------------------------------------------------------

/** A slug safe for use as a fragment identifier. */
function slugify(s, fallback) {
  const out = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return out || fallback
}

/**
 * Does this single-cell table announce a set of findings?
 *
 * The corpus labels these explicitly — "THREE CRITICAL FINDINGS", "THE SIX IPB GAPS",
 * "THE THREE FOUNDATIONAL FUNCTIONS". A label naming a count of findings, gaps or
 * functions is a key_findings block; anything else is a callout. The distinction is
 * editorial and is surfaced in the summary so it can be checked rather than trusted.
 */
const FINDINGS_LABEL =
  /\b(FINDINGS?|GAPS?|FUNCTIONS?|PRINCIPLES?)\b/i

function splitCallout(text) {
  // The label runs to the first sentence-ending or to the first lower-case word after
  // a run of capitals. Word gives no structural marker, so this is a heuristic and the
  // summary reports every label it produced for review.
  const m = text.match(/^([A-Z0-9][A-Z0-9 '’\-:,\.]{4,80}?)(?=[A-Z][a-z]|\d\.)/)
  if (!m) return { label: null, body: text }
  return { label: m[1].trim(), body: text.slice(m[1].length).trim() }
}

function buildModules(doc, plan) {
  const modules = []
  const notes = { callouts: [], tablesWithoutCaption: 0, skipped: [] }
  const used = new Set()

  const add = (moduleKey, fragmentSeed, payload) => {
    let fragmentId = slugify(fragmentSeed, `m-${modules.length}`)
    let n = 2
    while (used.has(fragmentId)) fragmentId = `${slugify(fragmentSeed, 'm')}-${n++}`
    used.add(fragmentId)
    modules.push({ moduleKey, fragmentId, payload })
  }

  // Batch A removed the compromise that used to live here. The distribution marking
  // is a version field (S2) with its own rendering obligation, not a body module: a
  // marking carried as content would be part of the prose, would land in the derived
  // plain text and markdown, and would be indexed as body copy.
  //
  // `plan.markingKey` names a row in cms.distribution_markings. A plan still carrying
  // the old free-text `marking` is refused rather than silently ingested the old way.
  if (plan.marking) {
    throw new Error(
      'plan uses the pre-Batch-A `marking` field; use `markingKey` referencing cms.distribution_markings',
    )
  }

  for (const block of doc.body) {
    if (block.skip) {
      notes.skipped.push(block.text.slice(0, 60))
      continue
    }
    if (block.kind === 'heading') {
      add('heading', block.text, { heading: block.text, level: Math.min(block.level + 1, 6) })
    } else if (block.kind === 'prose') {
      add('prose', `p-${modules.length}`, { text: block.text })
    } else if (block.kind === 'callout') {
      const { label, body } = splitCallout(block.text)
      notes.callouts.push({ label, kind: label && FINDINGS_LABEL.test(label) ? 'key_findings' : 'callout' })
      if (label && FINDINGS_LABEL.test(label)) {
        // Split the body into items on the pattern the corpus uses: a capitalised
        // term followed by a colon.
        const items = body
          .split(/(?=(?:[A-Z][A-Za-z ]{2,30}|Gap \d+|Action \d+):\s)/)
          .map((s) => s.trim())
          .filter(Boolean)
        add('key_findings', label, { label, items: items.length > 1 ? items : [body] })
      } else {
        add('callout', label ?? `callout-${modules.length}`, {
          ...(label ? { label } : {}),
          text: body,
        })
      }
    } else if (block.kind === 'table') {
      notes.tablesWithoutCaption += 1
      add('table', `table-${modules.length}`, {
        headers: block.rows[0],
        rows: block.rows.slice(1),
        // REQUIRED by the registered schema and absent from every document in the
        // corpus. Supplied from the plan, where a human wrote it.
        caption: plan.tableCaptions?.[String(notes.tablesWithoutCaption)] ?? null,
      })
    }
  }

  return { modules, notes }
}

/**
 * Classify the document's blocks.
 *
 * Front matter is recognised by the labels the corpus actually uses and is routed to
 * version fields rather than to modules.
 */
const FRONT_MATTER_LABELS = new Set([
  'ASSESSMENT SCOPE',
  'SCOPE',
  'PREMISE',
  'PRIMARY SOURCES',
  'DATE',
  'PRODUCED BY',
  'CLASSIFICATION',
  'TABLE OF CONTENTS',
])

function classify(rawBlocks, plan) {
  const out = []
  let inFrontMatter = true
  let pendingLabel = null
  const frontMatter = {}

  for (const b of rawBlocks) {
    if (b.kind === 'table') {
      const rows = tableRows(b.xml)
      if (rows.length === 1 && rows[0].length === 1) {
        out.push({ kind: 'callout', text: rows[0][0] })
      } else {
        out.push({ kind: 'table', rows })
      }
      inFrontMatter = false
      continue
    }

    const text = textOf(b.xml).trim()
    if (!text) continue
    const level = headingLevel(paragraphStyle(b.xml))

    if (level !== null) {
      inFrontMatter = false
      out.push({ kind: 'heading', level, text })
      continue
    }

    if (inFrontMatter) {
      if (FRONT_MATTER_LABELS.has(text.toUpperCase())) {
        pendingLabel = text.toUpperCase()
        continue
      }
      if (pendingLabel) {
        frontMatter[pendingLabel] = text
        pendingLabel = null
        continue
      }
      // Title, subtitle, banner and the sources statement, in document order.
      frontMatter._lead = frontMatter._lead ? [...frontMatter._lead, text] : [text]
      continue
    }

    // The terminal source block and everything after it is bibliography, not body.
    if (/^(Principal Sources|References|Bibliography|Selected Sources|Sources)$/i.test(text)) {
      out.push({ kind: 'sources-start', text })
      continue
    }
    out.push({ kind: 'prose', text })
  }

  // Everything after the terminal source heading becomes reference entries.
  const cut = out.findIndex((b) => b.kind === 'sources-start')
  const body = cut >= 0 ? out.slice(0, cut) : out
  const sourceLines =
    cut >= 0 ? out.slice(cut + 1).filter((b) => b.kind === 'prose').map((b) => b.text) : []

  void plan
  return { body, frontMatter, sourceLines }
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

async function ingest(client, doc, plan, summary) {
  const { rows: itemRows } = await client.query(
    `INSERT INTO cms.content_items (content_type_key, canonical_slug, lifecycle_state, created_by)
     VALUES ($1, $2, 'draft', $3)
     RETURNING id, public_id`,
    [plan.contentType, plan.slug, plan.authorUserId],
  )
  const itemId = itemRows[0].id
  summary.publicId = itemRows[0].public_id

  const { rows: versionRows } = await client.query(
    `INSERT INTO cms.content_versions
       (content_item_id, version_number, title, subtitle, standfirst, executive_summary,
        methodology, limitations, stated_date, stated_date_precision,
        distribution_marking_key, status, created_by)
     VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft', $11)
     RETURNING id, public_version_id`,
    [
      itemId,
      plan.title,
      // Batch A: the subtitle has its own column (S1). It no longer displaces the
      // standfirst, which is a lede and is null when the document has none.
      plan.subtitle ?? null,
      plan.standfirst ?? null,
      plan.executiveSummary,
      plan.methodology,
      plan.limitations,
      // S3: the date the document states, at the precision it states it. Never
      // widened to a day the document does not give.
      plan.statedDate ?? null,
      plan.statedDatePrecision ?? null,
      plan.markingKey ?? null,
      plan.authorUserId,
    ],
  )
  const versionId = versionRows[0].id
  summary.versionId = versionId
  summary.itemId = itemId
  summary.publicVersionId = versionRows[0].public_version_id

  const { modules, notes } = buildModules(doc, plan)
  summary.moduleNotes = notes
  let position = 0
  for (const m of modules) {
    await client.query(
      `INSERT INTO cms.content_version_modules (version_id, module_key, position, fragment_id, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [versionId, m.moduleKey, position++, m.fragmentId, JSON.stringify(m.payload)],
    )
  }
  summary.modules = modules.length
  summary.moduleTypes = modules.reduce((acc, m) => {
    acc[m.moduleKey] = (acc[m.moduleKey] ?? 0) + 1
    return acc
  }, {})

  // Contributor. Organisational authorship has no representation until Batch A (S4),
  // so a document that names no person gets no contributor row rather than a
  // fabricated one.
  if (plan.contributorPersonSlug) {
    await client.query(
      `INSERT INTO cms.content_contributors (version_id, person_id, role, affiliation, position)
       SELECT $1, p.id, 'author', $2, 0 FROM identity.people p WHERE p.slug = $3`,
      [versionId, plan.affiliation ?? null, plan.contributorPersonSlug],
    )
    summary.contributor = plan.contributorPersonSlug
  } else if (plan.contributorOrganisationSlug) {
    // S4: a document that names no individual is still attributed. Crediting the
    // organisation is true; inventing a person would not be.
    await client.query(
      `INSERT INTO cms.content_contributors (version_id, organisation_id, role, affiliation, position)
       SELECT $1, o.id, 'author', $2, 0 FROM identity.organisations o WHERE o.slug = $3`,
      [versionId, plan.affiliation ?? null, plan.contributorOrganisationSlug],
    )
    summary.contributor = `organisation:${plan.contributorOrganisationSlug}`
  } else {
    summary.contributor = null
    summary.contributorAbsentReason = 'the plan names neither a person nor an organisation'
  }

  // Taxonomy
  for (const slug of plan.terms ?? []) {
    await client.query(
      `INSERT INTO taxonomy.content_terms (content_item_id, term_id)
       SELECT $1, t.id FROM taxonomy.terms t WHERE t.slug = $2
       ON CONFLICT DO NOTHING`,
      [itemId, slug],
    )
  }

  // Workflow entry
  await client.query(
    `INSERT INTO workflow.content_state (version_id, state_key, entered_by)
     VALUES ($1, 'draft', $2)`,
    [versionId, plan.authorUserId],
  )
  for (const [role, userId] of Object.entries(plan.assignments ?? {})) {
    await client.query(
      `INSERT INTO workflow.assignments (version_id, user_id, assignment_role, assigned_by)
       VALUES ($1, $2, $3, $4)`,
      [versionId, userId, role, plan.authorUserId],
    )
  }

  return { itemId, versionId }
}

async function ingestSources(client, versionId, plan, summary) {
  const sourceIds = {}
  let created = 0
  for (const src of plan.sources) {
    const digest = createHash('sha256').update(src.title).digest('hex').slice(0, 12)
    const { rows } = await client.query(
      `INSERT INTO knowledge.sources
         (source_type, origin, title, publisher, publication_date, credibility,
          credibility_notes, notes, created_by)
       VALUES ($1, 'external', $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (normalised_title, normalised_publisher, publication_date) DO UPDATE
         SET notes = COALESCE(knowledge.sources.notes, EXCLUDED.notes)
       RETURNING id`,
      [
        src.type ?? 'report',
        src.title,
        src.publisher ?? null,
        src.date ?? null,
        src.credibility ?? 'unassessed',
        // Required by sources_credibility_notes_when_doubted whenever credibility is
        // mixed, contested or unreliable. The constraint caught this being omitted on
        // the first ingestion run, which is the constraint working: a source marked
        // doubtful with no reason recorded is an unexplained editorial judgement.
        src.credibilityNotes ?? null,
        // The document's own statement of what this source establishes (F18).
        src.establishes ?? null,
        plan.authorUserId,
      ],
    )
    sourceIds[src.key ?? digest] = rows[0].id
    created += 1
  }
  summary.sources = created

  let claimCount = 0
  let linkCount = 0
  const claimIds = {}

  // Claims form a dependency graph, not a list: an interpretation must name the
  // finding it reads and a recommendation the finding it rests on
  // (claims_interpretation_requires_basis / claims_recommendation_requires_basis).
  // Insert in dependency order so a basis exists before the claim that cites it.
  // The constraint caught this on the first run — the ordering is a real property of
  // the model, not an implementation detail of this script.
  const ordered = []
  const pending = [...plan.claims]
  let guard = pending.length + 1
  while (pending.length > 0 && guard-- > 0) {
    for (let i = 0; i < pending.length; i++) {
      const c = pending[i]
      if (!c.basis || ordered.some((o) => o.key === c.basis)) {
        ordered.push(c)
        pending.splice(i, 1)
        break
      }
    }
  }
  if (pending.length > 0) {
    throw new Error(
      `claim basis references form a cycle or name an unknown claim: ${pending
        .map((c) => c.key ?? c.assertion.slice(0, 40))
        .join('; ')}`,
    )
  }

  for (const claim of ordered) {
    const { rows } = await client.query(
      `INSERT INTO knowledge.claims
         (version_id, fragment_id, claim_type, assertion, confidence, confidence_rationale,
          value, value_lower, value_upper, unit, period_label, is_unverified,
          basis_claim_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        versionId,
        claim.fragmentId ?? null,
        claim.type,
        claim.assertion,
        claim.confidence ?? 'medium',
        claim.confidenceRationale ?? null,
        claim.value ?? null,
        claim.valueLower ?? null,
        claim.valueUpper ?? null,
        claim.unit ?? null,
        claim.periodLabel ?? null,
        claim.type === 'assumption',
        claim.basis ? claimIds[claim.basis] : null,
        plan.authorUserId,
      ],
    )
    if (claim.key) claimIds[claim.key] = rows[0].id
    claimCount += 1
    for (const link of claim.sources ?? []) {
      await client.query(
        `INSERT INTO knowledge.claim_sources
           (claim_id, source_id, relationship, location, location_type, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          rows[0].id,
          sourceIds[link.source],
          link.relationship ?? 'supports',
          link.location ?? null,
          link.locationType ?? null,
          link.note ?? null,
          plan.authorUserId,
        ],
      )
      linkCount += 1
    }
  }
  summary.claims = claimCount
  summary.claimSourceLinks = linkCount
}

// ---------------------------------------------------------------------------

/**
 * The summary is data, not a log line: it goes to stdout so a caller can pipe it,
 * while diagnostics go to stderr. `console.log` is for logging and the lint rule
 * correctly refuses it here.
 */
function emit(summary) {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

async function main() {
  const { values } = parseArgs({
    options: {
      source: { type: 'string' },
      plan: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  })
  if (!values.source || !values.plan) {
    console.error('usage: ingest.mjs --source <file.docx> --plan <plan.json> [--dry-run]')
    process.exit(2)
  }

  const plan = JSON.parse(readFileSync(values.plan, 'utf8'))
  const xml = readDocx(values.source)
  const raw = blocks(xml)
  const { body, frontMatter, sourceLines } = classify(raw, plan)
  const doc = { body, frontMatter, sourceLines }

  const summary = {
    source: values.source,
    blocks: raw.length,
    frontMatterFields: Object.keys(frontMatter),
    terminalSourceLines: sourceLines.length,
  }

  if (values['dry-run']) {
    const { modules, notes } = buildModules(doc, plan)
    summary.modules = modules.length
    summary.moduleTypes = modules.reduce((a, m) => ((a[m.moduleKey] = (a[m.moduleKey] ?? 0) + 1), a), {})
    summary.moduleNotes = notes
    emit(summary)
    return
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    await client.query('BEGIN')
    // Ingestion runs as the platform, not as an API role: it writes draft rows on
    // behalf of an author who is recorded as created_by. The workflow that follows is
    // performed by real actors through the real functions.
    const { versionId } = await ingest(client, doc, plan, summary)
    await ingestSources(client, versionId, plan, summary)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }

  emit(summary)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
