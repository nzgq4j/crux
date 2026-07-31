import { ListingSkeleton } from '@/components/ui/states'

export default function Loading() {
  return (
    <div className="mx-auto max-w-[--container-wide] px-6">
      {/* Announced once, rather than the skeleton being read out cell by cell. */}
      <p role="status" className="sr-only">
        Loading
      </p>
      <div aria-hidden="true" className="border-b border-[--color-rule] py-12">
        <div className="h-3 w-24 bg-[--color-surface-sunken]" />
        <div className="mt-4 h-9 w-2/3 bg-[--color-surface-sunken]" />
        <div className="mt-4 h-5 w-1/2 bg-[--color-surface-sunken]" />
      </div>
      <ListingSkeleton />
    </div>
  )
}
