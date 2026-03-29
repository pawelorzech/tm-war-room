'use client';

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 flex items-center justify-between gap-3">
      <p className="text-danger text-sm">{message}</p>
      {onRetry && (
        <button onClick={onRetry}
          className="px-3 py-1 text-xs rounded-lg bg-danger/20 text-danger hover:bg-danger/30 transition-colors font-medium shrink-0">
          Retry
        </button>
      )}
    </div>
  );
}
