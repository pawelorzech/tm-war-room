'use client';

import { exportCSV } from '@/lib/csv-export';

interface ExportButtonProps {
  rows: Record<string, unknown>[];
  columns: { key: string; label: string }[];
  filename: string;
  label?: string;
}

export function ExportButton({ rows, columns, filename, label = 'Export CSV' }: ExportButtonProps) {
  if (rows.length === 0) return null;
  return (
    <button
      onClick={() => exportCSV(rows, columns, filename)}
      className="px-2.5 py-1 text-xs bg-bg-card text-text-secondary rounded-lg hover:bg-bg-elevated hover:text-text-primary transition-colors border border-text-secondary/20"
    >
      {label}
    </button>
  );
}
