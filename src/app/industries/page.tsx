import type { Metadata } from 'next'
import { PageHeader } from '@/components/ui/states'
import { TermIndex } from '@/components/content/TermIndex'

export const revalidate = 600

export const metadata: Metadata = {
  title: 'Industries',
  description: 'Research organised by the sectors it addresses.',
  alternates: { canonical: '/industries' },
}

export default function IndustriesPage() {
  return (
    <div className="mx-auto max-w-[--container-wide] px-6">
      <PageHeader
        eyebrow="Industries"
        title="Research by sector"
        lede="Each sector draws on the same controlled vocabulary used to classify every published item."
      />
      <TermIndex vocabulary="industry" hrefPrefix="/industries" />
    </div>
  )
}
