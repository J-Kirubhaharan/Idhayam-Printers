export const Skeleton = ({ className = '' }) => (
  <div className={`skeleton ${className}`} />
)

export const SkeletonRow = ({ cols = 6 }) => (
  <tr>
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="p-3"><Skeleton className="h-4 w-full" /></td>
    ))}
  </tr>
)

export const SkeletonCard = () => (
  <div className="card">
    <Skeleton className="h-3 w-24 mb-3" />
    <Skeleton className="h-8 w-32" />
  </div>
)
