'use client';

import { useState } from 'react';
import { CHANGELOG, CURRENT_VERSION } from '@/data/changelog';
import type { ChangelogChange, ChangelogEntry } from '@/data/changelog';
import { useVersionNotice } from '@/hooks/useVersionNotice';

const TYPE_STYLES: Record<ChangelogChange['type'], { label: string; color: string }> = {
  feat: { label: 'NEW', color: 'bg-torn-green/20 text-torn-green' },
  fix: { label: 'FIX', color: 'bg-red-500/20 text-red-400' },
  improve: { label: 'IMPROVED', color: 'bg-blue-500/20 text-blue-400' },
};

function ChangeRow({ change }: { change: ChangelogChange }) {
  const style = TYPE_STYLES[change.type];
  const badge = (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${style.color}`}>
      {style.label}
    </span>
  );

  // Fix entries get a Before / Now block plus optional "Why it broke" line.
  if (change.type === 'fix') {
    return (
      <div className="flex items-start gap-2 pt-2">
        {badge}
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-sm font-medium text-text-primary leading-snug">{change.summary}</p>
          <div className="rounded-lg border border-text-secondary/15 bg-bg-elevated/40 overflow-hidden text-sm">
            <div className="flex items-start gap-3 px-3 py-2 border-b border-text-secondary/10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 shrink-0 w-12 pt-0.5">
                Before
              </span>
              <span className="text-text-secondary leading-snug">{change.before}</span>
            </div>
            <div className="flex items-start gap-3 px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-torn-green shrink-0 w-12 pt-0.5">
                Now
              </span>
              <span className="text-text-secondary leading-snug">{change.after}</span>
            </div>
          </div>
          {change.cause && (
            <p className="text-xs italic text-text-muted leading-snug">
              <span className="not-italic font-medium text-text-muted/80">Why it broke — </span>
              {change.cause}
            </p>
          )}
        </div>
      </div>
    );
  }

  // feat / improve — summary + optional detail.
  return (
    <div className="flex items-start gap-2 pt-2">
      {badge}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-medium text-text-primary leading-snug">{change.summary}</p>
        {change.detail && (
          <p className="text-sm text-text-secondary leading-snug">{change.detail}</p>
        )}
      </div>
    </div>
  );
}

function VersionCard({ entry, defaultOpen }: { entry: ChangelogEntry; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const isLatest = entry.version === CURRENT_VERSION;

  return (
    <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-bg-elevated/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg font-bold text-text-primary shrink-0">v{entry.version}</span>
          {isLatest && (
            <span className="text-[10px] font-bold uppercase tracking-wider bg-torn-green/20 text-torn-green px-2 py-0.5 rounded-full shrink-0">
              Latest
            </span>
          )}
          <span className="text-sm text-text-secondary truncate">{entry.title}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-text-muted">{entry.date}</span>
          <span className="text-text-muted text-xs">{open ? '▾' : '▸'}</span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border-light">
          {entry.changes.map((change, i) => (
            <ChangeRow key={i} change={change} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChangelogPage() {
  const { dismiss, showNotice } = useVersionNotice();

  // Auto-dismiss on visiting changelog
  if (showNotice) {
    dismiss();
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Changelog</h1>
        <p className="text-sm text-text-muted mt-1">
          All updates and improvements to TM Hub. Current version: <span className="text-torn-green font-semibold">v{CURRENT_VERSION}</span>
        </p>
      </div>

      <div className="space-y-3">
        {CHANGELOG.map((entry, i) => (
          <VersionCard key={entry.version} entry={entry} defaultOpen={i === 0} />
        ))}
      </div>
    </div>
  );
}
