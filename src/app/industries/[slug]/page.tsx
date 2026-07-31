import type { Metadata } from 'next'
import { TermPage, termMetadata } from '@/components/content/TermPage'
import { pageParam } from '@/lib/content/page-helpers'

export const revalidate = 300

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  return termMetadata(slug, 'Industries')
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams])
  return <TermPage slug={slug} eyebrow="Industry" basePath="/industries" page={pageParam(sp['page'])} />
}
