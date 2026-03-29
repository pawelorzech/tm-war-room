'use client';

interface SortableHeaderProps {
  label: string;
  column: string;
  currentCol: string;
  currentDir: 'asc' | 'desc';
  onSort: (col: string) => void;
  className?: string;
}

export function SortableHeader({ label, column, currentCol, currentDir, onSort, className = '' }: SortableHeaderProps) {
  const isActive = currentCol === column;
  return (
    <th
      className={`py-2 px-3 cursor-pointer select-none hover:text-text-primary transition-colors ${className}`}
      onClick={() => onSort(column)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          <span className="text-torn-green text-[10px]">{currentDir === 'asc' ? '▲' : '▼'}</span>
        ) : (
          <span className="text-text-muted/30 text-[10px]">⇅</span>
        )}
      </span>
    </th>
  );
}
