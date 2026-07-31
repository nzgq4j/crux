'use client'

import Link from 'next/link'
import { useEffect } from 'react'

/**
 * Route-level error boundary.
 *
 * Shows a sanitised message and the digest only — never a stack trace, a SQL
 * fragment, or an internal path (rules/backend.md 16). The digest is the handle
 * support needs to correlate the failure with the server log.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Reported to the error monitor in Block 19; console.error is the interim
    // sink and carries no user data.
    console.error('route error', error.digest ?? '(no digest)')
  }, [error])

  return (
    <div className="mx-auto max-w-[--container-reading] px-6 py-24">
      <p className="mb-3 text-[--text-label] font-semibold uppercase tracking-[--text-label--letter-spacing] text-[--color-danger]">
        Something went wrong
      </p>
      <h1 className="font-[--font-display] text-[--text-h1] font-semibold leading-[--text-h1--line-height]">
        This page could not be loaded
      </h1>
      <p className="mt-4 text-[--color-ink-muted]">
        The failure has been recorded. You can retry, or continue elsewhere on the site.
      </p>
      {error.digest && (
        <p className="mt-4 font-[--font-mono] text-[--text-caption] text-[--color-ink-faint]">
          Reference: {error.digest}
        </p>
      )}
      <div className="mt-8 flex flex-wrap gap-4">
        <button
          type="button"
          onClick={reset}
          className="border border-[--color-accent] bg-[--color-accent] px-5 py-2 font-semibold text-white"
        >
          Try again
        </button>
        <Link
          href="/"
          className="border border-[--color-rule-strong] px-5 py-2 text-[--color-ink] no-underline hover:border-[--color-accent]"
        >
          Go to the homepage
        </Link>
      </div>
    </div>
  )
}
