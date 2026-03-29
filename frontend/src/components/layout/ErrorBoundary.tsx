"use client";

import React from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-danger/10 border-2 border-danger rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💥</span>
            <h2 className="text-lg font-bold text-danger">Something crashed</h2>
          </div>

          <div className="bg-bg-primary rounded-lg p-4 border border-border">
            <p className="text-sm font-semibold text-text-primary mb-2">
              {error.name}: {error.message}
            </p>
            {error.stack && (
              <pre className="text-xs text-text-secondary overflow-x-auto whitespace-pre-wrap break-words max-h-64 overflow-y-auto font-mono leading-relaxed">
                {error.stack}
              </pre>
            )}
          </div>

          <p className="text-xs text-text-secondary">
            Copy the error above and send it to Bombel for debugging.
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 text-sm bg-torn-green text-white rounded-lg hover:bg-torn-green/90 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={async () => {
                const text = `${error.name}: ${error.message}\n\n${error.stack || ""}`;
                try {
                  await navigator.clipboard.writeText(text);
                  alert("Error copied to clipboard!");
                } catch {
                  const pre = document.querySelector('pre');
                  if (pre) {
                    const range = document.createRange();
                    range.selectNodeContents(pre);
                    window.getSelection()?.removeAllRanges();
                    window.getSelection()?.addRange(range);
                  }
                }
              }}
              className="px-4 py-2 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary hover:bg-bg-card transition-colors"
            >
              Copy Error
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm bg-bg-elevated border border-border rounded-lg text-text-secondary hover:bg-bg-card transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
