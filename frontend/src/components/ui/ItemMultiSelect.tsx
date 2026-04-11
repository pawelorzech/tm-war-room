'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';

interface SearchResult {
  id: number;
  name: string;
  type: string;
}

interface ItemMultiSelectProps {
  selected: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}

export function ItemMultiSelect({ selected, onChange, placeholder = 'Search items...' }: ItemMultiSelectProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.armourySearchItems(q);
      const filtered = res.items.filter(i => !selected.includes(i.name));
      setResults(filtered);
      setOpen(filtered.length > 0);
      setHighlightIdx(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [selected]);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  const addItem = (name: string) => {
    if (!selected.includes(name)) {
      onChange([...selected, name]);
    }
    setQuery('');
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  const removeItem = (name: string) => {
    onChange(selected.filter(i => i !== name));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open && results.length > 0) {
      e.preventDefault();
      addItem(results[highlightIdx].name);
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Backspace' && query === '' && selected.length > 0) {
      removeItem(selected[selected.length - 1]);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map(name => (
            <span key={name}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md bg-torn-green/15 text-torn-green font-medium">
              {name}
              <button onClick={() => removeItem(name)} type="button"
                className="ml-0.5 hover:text-white transition-colors" aria-label={`Remove ${name}`}>
                {'\u00D7'}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        placeholder={selected.length > 0 ? 'Add more items...' : placeholder}
        className="w-full bg-bg-elevated border border-text-secondary/20 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-torn-green/50"
      />

      {loading && (
        <div className="absolute right-3 top-[calc(100%-28px)] text-text-muted text-xs">...</div>
      )}

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto bg-bg-card border border-text-secondary/30 rounded-lg shadow-lg">
          {results.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onClick={() => addItem(item.name)}
              className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${
                idx === highlightIdx ? 'bg-torn-green/15 text-text-primary' : 'text-text-primary hover:bg-bg-elevated'
              }`}
            >
              <span className="font-medium">{item.name}</span>
              <span className="text-[10px] text-text-muted ml-2">{item.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
