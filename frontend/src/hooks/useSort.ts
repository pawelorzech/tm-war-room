import { useState, useMemo, useCallback } from 'react';

export type SortDir = 'asc' | 'desc';

export function useSort<T>(items: T[], defaultCol: keyof T & string, defaultDir: SortDir = 'desc') {
  const [sortCol, setSortCol] = useState<string>(defaultCol);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const toggle = useCallback((col: string) => {
    if (col === sortCol) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  }, [sortCol]);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortCol];
      const bv = (b as Record<string, unknown>)[sortCol];
      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv;
      } else if (typeof av === 'string' && typeof bv === 'string') {
        cmp = av.localeCompare(bv, undefined, { sensitivity: 'base' });
      } else if (typeof av === 'boolean' && typeof bv === 'boolean') {
        cmp = (av ? 1 : 0) - (bv ? 1 : 0);
      } else {
        cmp = String(av ?? '').localeCompare(String(bv ?? ''));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [items, sortCol, sortDir]);

  return { sorted, sortCol, sortDir, toggle };
}
