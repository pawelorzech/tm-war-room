'use client';

import { useState, useEffect } from 'react';

interface PageExplainerProps {
  id: string;
  title: string;
  bullets: string[];
  /** Data source attribution line(s) */
  dataSources?: string[];
  /** External links: [label, url] */
  links?: [string, string][];
}

export function PageExplainer({ id, title, bullets, dataSources, links }: PageExplainerProps) {
  const storageKey = `explainer_dismissed_${id}`;
  const [dismissed, setDismissed] = useState(true); // default hidden to avoid flash

  useEffect(() => {
    setDismissed(localStorage.getItem(storageKey) === '1');
  }, [storageKey]);

  if (dismissed) {
    return (
      <button
        onClick={() => { localStorage.removeItem(storageKey); setDismissed(false); }}
        className="text-xs text-text-muted hover:text-text-secondary transition-colors flex items-center gap-1"
      >
        <span>?</span> How does this work?
      </button>
    );
  }

  return (
    <div className="bg-torn-green/5 border border-torn-green/20 rounded-xl p-4 relative">
      <button
        onClick={() => { localStorage.setItem(storageKey, '1'); setDismissed(true); }}
        className="absolute top-2 right-2 text-text-muted hover:text-text-primary transition-colors text-lg leading-none px-1"
        aria-label="Close"
      >
        &times;
      </button>
      <p className="text-sm font-semibold text-torn-green mb-2">{title}</p>
      <ul className="space-y-1.5">
        {bullets.map((b, i) => (
          <li key={i} className="text-xs text-text-secondary flex gap-2">
            <span className="text-torn-green shrink-0 mt-0.5">&#9656;</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      {dataSources && dataSources.length > 0 && (
        <div className="mt-3 pt-2 border-t border-torn-green/10">
          <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-1">Data Sources</p>
          {dataSources.map((s, i) => (
            <p key={i} className="text-[10px] text-text-muted">{s}</p>
          ))}
        </div>
      )}
      {links && links.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {links.map(([label, url], i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-torn-green hover:text-torn-green/80 underline underline-offset-2 transition-colors">
              {label} ↗
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
