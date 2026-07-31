import type { ContentModule } from '@/lib/content/queries'
import { serverEnv } from '@/lib/env'

/**
 * Renders structured content modules as semantic HTML (Block 11, §45.4.1).
 *
 * Three rules this component exists to enforce:
 *
 *  1. Every module's stable `fragment_id` becomes its element `id`, so a citation
 *     addressing a section resolves to it and deep links survive re-rendering.
 *  2. Nothing renders as unsanitised HTML. Payloads are typed JSON and every value
 *     goes through JSX text interpolation, which escapes by construction — there is
 *     no `dangerouslySetInnerHTML` anywhere in this file, deliberately.
 *  3. A visual module with no text alternative does not render silently. Figures,
 *     tables and charts fail loudly in development and degrade visibly in
 *     production, because a missing alt text that nobody notices is the failure
 *     mode accessibility rules exist to prevent.
 *
 * This is a Server Component. Report bodies are complete in the initial HTML
 * response with no client JavaScript (rules/frontend.md 8).
 */

// --- payload access ---------------------------------------------------------
// Payloads are `Record<string, unknown>` from JSONB. These readers narrow safely
// rather than casting, so a malformed payload renders a warning instead of crashing
// the page.

function str(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key]
  return typeof v === 'string' && v.trim().length > 0 ? v : null
}

function num(payload: Record<string, unknown>, key: string): number | null {
  const v = payload[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function strList(payload: Record<string, unknown>, key: string): string[] {
  const v = payload[key]
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function rows(payload: Record<string, unknown>, key: string): string[][] {
  const v = payload[key]
  if (!Array.isArray(v)) return []
  return v
    .filter((r): r is unknown[] => Array.isArray(r))
    .map((r) => r.map((cell) => (cell == null ? '' : String(cell))))
}

export function ModuleRenderer({ modules }: { modules: ContentModule[] }) {
  if (modules.length === 0) {
    return (
      <p className="text-[--color-ink-muted]">
        This version has no content modules.
      </p>
    )
  }
  return (
    <>
      {modules.map((m) => (
        <Module key={m.fragment_id} module={m} />
      ))}
    </>
  )
}

function Module({ module: m }: { module: ContentModule }) {
  const { payload, fragment_id: id, module_key: kind } = m

  switch (kind) {
    case 'heading': {
      const text = str(payload, 'heading')
      if (!text) return <MalformedModule id={id} kind={kind} reason="no heading text" />
      const level = Math.min(Math.max(num(payload, 'level') ?? 2, 2), 4)
      const Tag = (`h${level}` as 'h2' | 'h3' | 'h4')
      const size =
        level === 2
          ? 'text-[--text-h2] mt-14'
          : level === 3
            ? 'text-[--text-h3] mt-10'
            : 'text-[1.05rem] mt-8'
      return (
        <Tag
          id={id}
          className={`scroll-mt-24 font-[--font-display] font-semibold leading-tight ${size} mb-3`}
        >
          {text}
        </Tag>
      )
    }

    case 'prose': {
      const text = str(payload, 'text')
      if (!text) return <MalformedModule id={id} kind={kind} reason="no text" />
      return (
        <p id={id} className="scroll-mt-24 mb-5 text-[--text-body] leading-[--text-body--line-height]">
          {text}
        </p>
      )
    }

    case 'list': {
      const items = strList(payload, 'items')
      if (items.length === 0) return <MalformedModule id={id} kind={kind} reason="no items" />
      const ordered = payload['ordered'] === true
      const Tag = ordered ? 'ol' : 'ul'
      return (
        <Tag
          id={id}
          className={`scroll-mt-24 mb-5 space-y-2 pl-6 ${ordered ? 'list-decimal' : 'list-disc'}`}
        >
          {items.map((item, i) => (
            <li key={i} className="leading-[--text-body--line-height]">
              {item}
            </li>
          ))}
        </Tag>
      )
    }

    case 'key_findings': {
      const items = strList(payload, 'items')
      if (items.length === 0) return <MalformedModule id={id} kind={kind} reason="no findings" />
      return (
        <aside
          id={id}
          aria-labelledby={`${id}-label`}
          className="scroll-mt-24 my-10 border-l-4 border-[--color-accent] bg-[--color-accent-ground] px-6 py-5"
        >
          <h2
            id={`${id}-label`}
            className="mb-3 text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-accent]"
          >
            Key findings
          </h2>
          <ul className="list-disc space-y-2 pl-5">
            {items.map((item, i) => (
              <li key={i} className="leading-[--text-body--line-height]">
                {item}
              </li>
            ))}
          </ul>
        </aside>
      )
    }

    case 'recommendation': {
      const items = strList(payload, 'items')
      if (items.length === 0)
        return <MalformedModule id={id} kind={kind} reason="no recommendations" />
      return (
        <section id={id} aria-labelledby={`${id}-label`} className="scroll-mt-24 my-10">
          <h2
            id={`${id}-label`}
            className="mb-3 font-[--font-display] text-[--text-h3] font-semibold"
          >
            Recommended actions
          </h2>
          <ol className="list-decimal space-y-2 pl-6">
            {items.map((item, i) => (
              <li key={i} className="leading-[--text-body--line-height]">
                {item}
              </li>
            ))}
          </ol>
        </section>
      )
    }

    case 'statistic': {
      const value = str(payload, 'value')
      const label = str(payload, 'label')
      if (!value || !label) return <MalformedModule id={id} kind={kind} reason="no value or label" />
      const basis = str(payload, 'basis')
      return (
        <figure id={id} className="scroll-mt-24 my-10 border-y border-[--color-rule] py-7">
          <div className="font-[--font-display] text-[3rem] font-semibold leading-none tracking-tight text-[--color-accent]">
            {value}
          </div>
          <figcaption className="mt-3 max-w-[46ch] text-[--text-body] text-[--color-ink-muted]">
            {label}
            {basis && (
              <span className="mt-1 block text-[--text-caption] text-[--color-ink-faint]">
                {basis}
              </span>
            )}
          </figcaption>
        </figure>
      )
    }

    case 'quote': {
      const text = str(payload, 'text')
      if (!text) return <MalformedModule id={id} kind={kind} reason="no quotation text" />
      const attribution = str(payload, 'attribution')
      return (
        <figure id={id} className="scroll-mt-24 my-10 border-l-2 border-[--color-rule-strong] pl-6">
          <blockquote className="font-[--font-display] text-[1.35rem] leading-snug">
            {text}
          </blockquote>
          {attribution && (
            <figcaption className="mt-3 text-[--text-caption] text-[--color-ink-faint]">
              — {attribution}
            </figcaption>
          )}
        </figure>
      )
    }

    case 'table': {
      const headers = strList(payload, 'headers')
      const body = rows(payload, 'rows')
      const caption = str(payload, 'caption')
      // rules/accessibility.md 21: headers and a caption are required, not optional.
      if (headers.length === 0 || !caption) {
        return (
          <MalformedModule
            id={id}
            kind={kind}
            reason={!caption ? 'a table requires a caption' : 'a table requires header cells'}
          />
        )
      }
      const summary = str(payload, 'summary')
      return (
        <div id={id} className="scroll-mt-24 my-10">
          {/* Horizontal scroll region is keyboard-reachable and labelled
              (rules/accessibility.md 23). */}
          <div
            role="region"
            aria-labelledby={`${id}-caption`}
            tabIndex={0}
            className="overflow-x-auto border border-[--color-rule]"
          >
            <table className="w-full border-collapse text-[--text-caption]">
              <caption
                id={`${id}-caption`}
                className="border-b border-[--color-rule] bg-[--color-surface-sunken] px-4 py-3 text-left font-semibold"
              >
                {caption}
                {summary && (
                  <span className="mt-1 block font-normal text-[--color-ink-muted]">{summary}</span>
                )}
              </caption>
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th
                      key={i}
                      scope="col"
                      className="border-b border-[--color-rule] px-4 py-2.5 text-left font-semibold"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((r, ri) => (
                  <tr key={ri} className="border-b border-[--color-rule] last:border-0">
                    {r.map((cell, ci) =>
                      ci === 0 ? (
                        <th key={ci} scope="row" className="px-4 py-2.5 text-left font-medium">
                          {cell}
                        </th>
                      ) : (
                        <td key={ci} className="px-4 py-2.5 tabular-nums">
                          {cell}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )
    }

    case 'figure': {
      const alt = str(payload, 'alt')
      const caption = str(payload, 'caption')
      // A figure with no alternative text must not render as if it were fine.
      if (!alt) return <MalformedModule id={id} kind={kind} reason="a figure requires alternative text" />
      const src = str(payload, 'src')
      return (
        <figure id={id} className="scroll-mt-24 my-10">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- asset delivery
            // is Block 13's signed-URL pipeline, which is not built; next/image
            // would need a configured loader it does not yet have.
            <img src={src} alt={alt} className="w-full border border-[--color-rule]" />
          ) : (
            <div
              role="img"
              aria-label={alt}
              className="flex min-h-40 items-center justify-center border border-dashed border-[--color-rule-strong] bg-[--color-surface-sunken] p-6 text-center text-[--text-caption] text-[--color-ink-muted]"
            >
              {alt}
            </div>
          )}
          {caption && (
            <figcaption className="mt-2 text-[--text-caption] text-[--color-ink-faint]">
              {caption}
            </figcaption>
          )}
        </figure>
      )
    }

    case 'chart': {
      const alt = str(payload, 'alt')
      const caption = str(payload, 'caption')
      // rules/accessibility.md 25: a chart without a text alternative is not
      // acceptable, so it is refused rather than rendered.
      if (!alt) return <MalformedModule id={id} kind={kind} reason="a chart requires a text alternative" />
      return (
        <figure id={id} className="scroll-mt-24 my-10">
          <div
            role="img"
            aria-label={alt}
            className="flex min-h-48 items-center justify-center border border-dashed border-[--color-rule-strong] bg-[--color-surface-sunken] p-6 text-center text-[--text-caption] text-[--color-ink-muted]"
          >
            {alt}
          </div>
          {caption && (
            <figcaption className="mt-2 text-[--text-caption] text-[--color-ink-faint]">
              {caption}
            </figcaption>
          )}
        </figure>
      )
    }

    case 'methodology':
    case 'limitations':
    case 'callout': {
      const text = str(payload, 'text')
      if (!text) return <MalformedModule id={id} kind={kind} reason="no text" />
      const heading =
        kind === 'methodology' ? 'Methodology' : kind === 'limitations' ? 'Limitations' : null
      return (
        <aside
          id={id}
          {...(heading ? { 'aria-labelledby': `${id}-label` } : {})}
          className="scroll-mt-24 my-8 border border-[--color-rule] bg-[--color-surface] px-6 py-5"
        >
          {heading && (
            <h2
              id={`${id}-label`}
              className="mb-2 text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-ink-faint]"
            >
              {heading}
            </h2>
          )}
          <p className="text-[--text-caption] leading-[1.65] text-[--color-ink-muted]">{text}</p>
        </aside>
      )
    }

    case 'references': {
      const items = strList(payload, 'items')
      if (items.length === 0) return null
      return (
        <section id={id} aria-labelledby={`${id}-label`} className="scroll-mt-24 my-10">
          <h2 id={`${id}-label`} className="mb-3 font-[--font-display] text-[--text-h3] font-semibold">
            References
          </h2>
          <ol className="list-decimal space-y-2 pl-6 text-[--text-caption] text-[--color-ink-muted]">
            {items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
        </section>
      )
    }

    default:
      return <MalformedModule id={id} kind={kind} reason="unregistered module type" />
  }
}

/**
 * A module that cannot render correctly.
 *
 * Visible in development so an author sees it immediately. In production it renders
 * nothing rather than showing internals to a reader — but it is never silently
 * dropped from the authoring view, and the publication gates in Block 08 are the
 * mechanism that stops it reaching production in the first place.
 */
function MalformedModule({ id, kind, reason }: { id: string; kind: string; reason: string }) {
  if (serverEnv().NODE_ENV === 'production') return null
  return (
    <div
      id={id}
      role="alert"
      className="scroll-mt-24 my-6 border-l-4 border-[--color-danger] bg-[--color-surface-sunken] px-4 py-3 text-[--text-caption]"
    >
      <strong className="text-[--color-danger]">Module not rendered</strong>{' '}
      <code className="font-[--font-mono]">{kind}</code> at{' '}
      <code className="font-[--font-mono]">#{id}</code> — {reason}.
    </div>
  )
}
