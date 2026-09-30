/** Loading skeletons that match the real card/row shapes. */
export function CardSkeleton({ className = '' }) {
  return (
    <div className={`w-[172px] shrink-0 sm:w-[200px] ${className}`}>
      <div className="skeleton aspect-square w-full rounded-xl" />
      <div className="skeleton mt-3 h-3.5 w-3/4 rounded" />
      <div className="skeleton mt-2 h-3 w-1/2 rounded" />
    </div>
  )
}

export function CardSkeletonRail({ count = 6 }) {
  return (
    <div className="rail">
      {Array.from({ length: count }).map((_, index) => (
        <CardSkeleton key={index} />
      ))}
    </div>
  )
}

export function RowSkeleton({ count = 5 }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl p-2">
          <div className="skeleton h-11 w-11 rounded-lg" />
          <div className="flex-1">
            <div className="skeleton h-3.5 w-1/3 rounded" />
            <div className="skeleton mt-2 h-3 w-1/4 rounded" />
          </div>
          <div className="skeleton h-3 w-10 rounded" />
        </div>
      ))}
    </div>
  )
}

export default CardSkeleton
