'use client';

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden animate-pulse">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i} className="py-2 px-3">
                  <div className="h-3 w-16 bg-bg-elevated rounded" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, ri) => (
              <tr key={ri} className="border-b border-border-light">
                {Array.from({ length: cols }).map((_, ci) => (
                  <td key={ci} className="py-2 px-3">
                    <div className={`h-3 rounded bg-bg-elevated ${ci === 0 ? 'w-24' : 'w-16'}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-bg-card border border-text-secondary/20 rounded-xl p-4">
          <div className="flex justify-between">
            <div className="space-y-2">
              <div className="h-4 w-32 bg-bg-elevated rounded" />
              <div className="h-3 w-48 bg-bg-elevated rounded" />
            </div>
            <div className="h-6 w-16 bg-bg-elevated rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-${count} gap-3 animate-pulse`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-bg-card border border-text-secondary/20 rounded-lg p-3 text-center">
          <div className="h-3 w-12 bg-bg-elevated rounded mx-auto mb-2" />
          <div className="h-6 w-16 bg-bg-elevated rounded mx-auto" />
        </div>
      ))}
    </div>
  );
}
