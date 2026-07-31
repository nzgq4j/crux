import { describe, it, expect, afterAll } from 'vitest'
import { asSuperuser, closeTestPool, expectDenied } from '../helpers/db'
import { scenario } from '../helpers/editorial'

/**
 * Batch A — the content metadata the validation corpus demonstrated was missing.
 *
 * The tests that matter most here are the immutability ones. Three new columns were
 * added to `cms.content_versions`, and a published version's subtitle, stated date and
 * distribution marking are part of what was published. A trigger that froze the title
 * but not the marking would be worse than no trigger, because the page would look
 * protected while its marking could be changed after the fact.
 */

afterAll(async () => {
  await closeTestPool()
})

describe('S1 — subtitle', () => {
  it('is a distinct column from standfirst', async () => {
    const cols = await asSuperuser(async (c) => {
      const r = await c.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema='cms' AND table_name='content_versions'
            AND column_name IN ('subtitle','standfirst')`,
      )
      return r.rows.map((x) => x.column_name).sort()
    })
    expect(cols).toEqual(['standfirst', 'subtitle'])
  })
})

describe('S3 — stated date and precision', () => {
  it('accepts a month-precision date', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.asOwner()
      await s.client.query(
        "UPDATE cms.content_versions SET stated_date=DATE '2026-04-01', stated_date_precision='month' WHERE id=$1",
        [versionId],
      )
      const r = await s.client.query<{ p: string }>(
        'SELECT stated_date_precision p FROM cms.content_versions WHERE id=$1',
        [versionId],
      )
      expect(r.rows[0]!.p).toBe('month')
    })
  })

  it('refuses a date with no precision, and a precision with no date', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.asOwner()
      await expectDenied(
        () =>
          s.client.query("UPDATE cms.content_versions SET stated_date=DATE '2026-04-01' WHERE id=$1", [
            versionId,
          ]),
        'a stated date with no recorded precision',
      )
      await expectDenied(
        () =>
          s.client.query("UPDATE cms.content_versions SET stated_date_precision='month' WHERE id=$1", [
            versionId,
          ]),
        'a precision with no date',
      )
    })
  })

  it('refuses an unknown precision', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.asOwner()
      await expectDenied(
        () =>
          s.client.query(
            "UPDATE cms.content_versions SET stated_date=DATE '2026-04-01', stated_date_precision='fortnight' WHERE id=$1",
            [versionId],
          ),
        'an unregistered precision',
      )
    })
  })
})

describe('S2 — distribution markings', () => {
  it('holds the five forms observed in the corpus', async () => {
    const keys = await asSuperuser(async (c) => {
      const r = await c.query<{ key: string }>(
        'SELECT key FROM cms.distribution_markings ORDER BY position',
      )
      return r.rows.map((x) => x.key)
    })
    expect(keys).toEqual([
      'unclassified',
      'unclassified_fouo',
      'unclassified_official_discussion',
      'distribution_advertising_industry',
      'distribution_adtech_policy',
    ])
  })

  it('stores the label verbatim, including the double slash', async () => {
    const label = await asSuperuser(async (c) => {
      const r = await c.query<{ label: string }>(
        "SELECT label FROM cms.distribution_markings WHERE key='unclassified_fouo'",
      )
      return r.rows[0]!.label
    })
    expect(label).toBe('UNCLASSIFIED // FOR OFFICIAL USE ONLY')
  })

  it('refuses a marking key that is not registered', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.asOwner()
      await expectDenied(
        () =>
          s.client.query(
            "UPDATE cms.content_versions SET distribution_marking_key='top_secret' WHERE id=$1",
            [versionId],
          ),
        'an unregistered marking',
      )
    })
  })

  it('is readable by an anonymous reader, because it renders on a public page', async () => {
    await scenario(async (s) => {
      await s.act(null, 'anon')
      const r = await s.client.query('SELECT key FROM cms.distribution_markings')
      expect(r.rowCount).toBeGreaterThan(0)
    })
  })

  it('DENIAL: no API role may add or change a marking', async () => {
    // The vocabulary is governed by migration. RLS grants SELECT and nothing else, so
    // a caller cannot mint a marking that looks official.
    await scenario(async (s) => {
      await s.act(s.actors.editor)
      await expectDenied(
        () =>
          s.client.query(
            "INSERT INTO cms.distribution_markings (key,label,description) VALUES ('x','X','x')",
          ),
        'an editor minting a distribution marking',
      )
      await expectDenied(
        () => s.client.query("UPDATE cms.distribution_markings SET label='Tampered'"),
        'an editor rewriting a marking label',
      )
    })
  })
})

describe('S4 — organisational authorship', () => {
  it('accepts an organisation as the credited contributor', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.asOwner()
      await s.client.query(
        `INSERT INTO cms.content_contributors (version_id, organisation_id, role, position)
         SELECT $1, o.id, 'author', 0 FROM identity.organisations o WHERE o.slug='crucible-insight'`,
        [versionId],
      )
      const r = await s.client.query<{ n: string }>(
        'SELECT count(*) n FROM cms.content_contributors WHERE version_id=$1 AND person_id IS NULL',
        [versionId],
      )
      expect(Number(r.rows[0]!.n)).toBe(1)
    })
  })

  it('refuses a contributor that is neither a person nor an organisation', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.asOwner()
      await expectDenied(
        () =>
          s.client.query(
            "INSERT INTO cms.content_contributors (version_id, role, position) VALUES ($1,'author',0)",
            [versionId],
          ),
        'an unattributed contributor row',
      )
    })
  })

  it('refuses a contributor that is both', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.asOwner()
      await expectDenied(
        () =>
          s.client.query(
            `INSERT INTO cms.content_contributors (version_id, person_id, organisation_id, role, position)
             SELECT $1, p.id, o.id, 'author', 0
               FROM identity.people p, identity.organisations o
              WHERE p.slug='h-okonkwo' AND o.slug='crucible-insight'`,
            [versionId],
          ),
        'a contributor credited as both a person and an organisation',
      )
    })
  })

  it('still refuses a duplicate organisational credit for the same role', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.asOwner()
      const insert = `INSERT INTO cms.content_contributors (version_id, organisation_id, role, position)
         SELECT $1, o.id, 'author', 0 FROM identity.organisations o WHERE o.slug='crucible-insight'`
      await s.client.query(insert, [versionId])
      await expectDenied(
        () => s.client.query(insert, [versionId]),
        'a duplicate organisational contributor',
      )
    })
  })
})

describe('S6 — a numeric claim must carry a unit', () => {
  it('refuses a value with no unit', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.asOwner()
      await expectDenied(
        () =>
          s.client.query(
            `INSERT INTO knowledge.claims (version_id, claim_type, assertion, value)
             VALUES ($1,'observed_fact','39,254 fatalities were recorded', 39254)`,
            [versionId],
          ),
        'a numeric claim with no unit',
      )
    })
  })

  it('accepts a value with a unit', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.asOwner()
      const r = await s.client.query(
        `INSERT INTO knowledge.claims (version_id, claim_type, assertion, value, unit)
         VALUES ($1,'observed_fact','39,254 fatalities were recorded', 39254, 'fatalities') RETURNING id`,
        [versionId],
      )
      expect(r.rowCount).toBe(1)
    })
  })

  it('still accepts a claim with no numeric payload at all', async () => {
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.asOwner()
      const r = await s.client.query(
        `INSERT INTO knowledge.claims (version_id, claim_type, assertion)
         VALUES ($1,'observed_fact','The policy authorised interagency data sharing') RETURNING id`,
        [versionId],
      )
      expect(r.rowCount).toBe(1)
    })
  })
})

describe('immutability covers the new columns', () => {
  /** Publish a version through the real workflow, then return its id. */
  async function published(s: Awaited<Parameters<Parameters<typeof scenario>[0]>[0]>) {
    const { itemId, versionId } = await s.createDraft()
    await s.act(s.actors.author)
    await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'in_review'])
    await s.act(s.actors.reviewer)
    await s.client.query('SELECT workflow.record_review($1,$2,$3,$4,$5,$6,$7)', [
      versionId,
      'approved',
      true,
      true,
      true,
      true,
      true,
    ])
    await s.act(s.actors.editor)
    await s.client.query('SELECT workflow.record_approval($1,$2,$3,$4,$5,$6)', [
      s.actors.editor,
      itemId,
      versionId,
      'approved',
      `test-${versionId}`,
      JSON.stringify({ rationale: 'test' }),
    ])
    await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'approved'])
    await s.act(s.actors.publisher)
    await s.client.query('SELECT workflow.perform_transition($1,$2)', [versionId, 'published'])
    await s.asOwner()
    return versionId
  }

  it.each([
    ['subtitle', "subtitle='Rewritten after publication'"],
    ['stated_date', "stated_date=DATE '1999-01-01', stated_date_precision='day'"],
    ['distribution_marking_key', "distribution_marking_key='unclassified'"],
  ])('a published version refuses a change to %s', async (_column, setClause) => {
    await scenario(async (s) => {
      const versionId = await published(s)
      const error = await expectDenied(
        () =>
          s.client.query(`UPDATE cms.content_versions SET ${setClause} WHERE id=$1`, [versionId]),
        `a post-publication change to ${_column}`,
      )
      expect(error.message).toMatch(/immutable/i)
    })
  })

  it('a draft still accepts changes to all three', async () => {
    // The inverse. If the trigger froze drafts too, editing would be impossible and
    // the tests above would pass for the wrong reason.
    await scenario(async (s) => {
      const { versionId } = await s.createDraft()
      await s.asOwner()
      await s.client.query(
        `UPDATE cms.content_versions
            SET subtitle=$2, stated_date=DATE '2026-04-01', stated_date_precision='month',
                distribution_marking_key='unclassified_fouo'
          WHERE id=$1`,
        [versionId, 'A subtitle'],
      )
      const r = await s.client.query<{ subtitle: string; k: string }>(
        'SELECT subtitle, distribution_marking_key k FROM cms.content_versions WHERE id=$1',
        [versionId],
      )
      expect(r.rows[0]!.subtitle).toBe('A subtitle')
      expect(r.rows[0]!.k).toBe('unclassified_fouo')
    })
  })
})
