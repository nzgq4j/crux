import type { Metadata } from 'next'
import { PageHeader } from '@/components/ui/states'
import { TermIndex } from '@/components/content/TermIndex'

export const revalidate = 600

export const metadata: Metadata = {
  title: 'Capabilities',
  description: 'Research organised by cross-cutting capability.',
  alternates: { canonical: '/capabilities' },
}

export default function CapabilitiesPage() {
  return (
    <div className="mx-auto max-w-[--container-wide] px-6">
      <PageHeader
        eyebrow="Capabilities"
        title="Research by capability"
        lede="Cross-cutting themes that recur across sectors."
      />
      <TermIndex vocabulary="capability" hrefPrefix="/capabilities" />
    </div>
  )
}
