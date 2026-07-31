import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/states'

export const metadata: Metadata = {
  title: 'About',
  description: 'How Crucible Insight publishes research, and how to check it.',
  alternates: { canonical: '/about' },
}

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[--container-wide] px-6">
      <PageHeader
        eyebrow="About"
        title="How we publish"
        lede="Crux is built so that a reader can check what they are told, and a citation resolves to exactly what was read."
      />

      <div className="max-w-[--container-reading] py-12">
        <h2 className="mt-10 mb-3 font-[--font-display] text-[--text-h2] font-semibold">
          Evidence before interpretation
        </h2>
        <p className="mb-5 leading-[--text-body--line-height]">
          Every finding is stored as a structured claim with a declared type — an
          observed fact, a derived finding, an interpretation, a forecast, or a
          recommendation among them. The type is enforced by the database, not applied
          as a label afterwards. A quantitative finding cannot be published unless it
          resolves to the analysis run, dataset version and variables that produced it.
        </p>

        <h2 className="mt-10 mb-3 font-[--font-display] text-[--text-h2] font-semibold">
          Versions do not change
        </h2>
        <p className="mb-5 leading-[--text-body--line-height]">
          Once a version is published it is immutable — its text, its figures, its
          contributors and its publication date are frozen. Corrections create a new
          version and carry a visible notice; the corrected version stays resolvable at
          its own address. Withdrawn work keeps its identifier and its citation record
          rather than vanishing.
        </p>

        <h2 className="mt-10 mb-3 font-[--font-display] text-[--text-h2] font-semibold">
          What we do not claim
        </h2>
        <p className="mb-5 leading-[--text-body--line-height]">
          Structured metadata, stable identifiers and machine-readable representations
          improve the conditions for accurate attribution. They do not guarantee that
          any search engine or language model will cite this work, and we do not
          suggest otherwise.
        </p>
        <p className="mb-5 leading-[--text-body--line-height]">
          The demonstration content currently on this site is fictional and labelled as
          such. It exists to exercise the publication format and establishes nothing
          about the world.
        </p>

        <h2 className="mt-10 mb-3 font-[--font-display] text-[--text-h2] font-semibold">
          Editorial process
        </h2>
        <p className="mb-5 leading-[--text-body--line-height]">
          Authorship, review, approval and publication are separate authorities. No
          single role can carry a piece of research from draft to publication alone, and
          the constraint is enforced in the database rather than by convention.
        </p>

        <p className="mt-10">
          <Link href="/research" className="text-[--color-accent]">
            Browse the research
          </Link>
        </p>
      </div>
    </div>
  )
}
