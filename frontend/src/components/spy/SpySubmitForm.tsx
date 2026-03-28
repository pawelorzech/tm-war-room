'use client';

import { useState } from 'react';
import { api } from '@/lib/api-client';

export function SpySubmitForm() {
  const [open, setOpen] = useState(false);
  const [playerId, setPlayerId] = useState('');
  const [strength, setStrength] = useState('');
  const [defense, setDefense] = useState('');
  const [speed, setSpeed] = useState('');
  const [dexterity, setDexterity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pid = parseInt(playerId, 10);
    if (!pid || isNaN(pid)) { setError('Enter a valid player ID'); return; }
    const str = parseFloat(strength);
    const def = parseFloat(defense);
    const spd = parseFloat(speed);
    const dex = parseFloat(dexterity);
    if ([str, def, spd, dex].some(n => isNaN(n) || n < 0)) { setError('All stats must be valid numbers'); return; }

    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      await api.spySubmit({ player_id: pid, strength: str, defense: def, speed: spd, dexterity: dex });
      setSuccess(true);
      setPlayerId(''); setStrength(''); setDefense(''); setSpeed(''); setDexterity('');
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full bg-bg-card border border-text-secondary/30 rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-torn-green focus:ring-1 focus:ring-torn-green";

  return (
    <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-bg-elevated/50 transition-colors"
      >
        <span className="font-medium text-text-primary">Submit Spy Report</span>
        <svg className={`w-4 h-4 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`}
             fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-text-secondary/10 px-4 py-4 space-y-3">
          <p className="text-xs text-text-secondary">
            Did a spy on someone in Torn? Paste their battle stats here.
            Go to their profile → Info → click the spy result to see the numbers.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Target Player ID</label>
              <input type="text" value={playerId} onChange={e => setPlayerId(e.target.value)}
                     placeholder="e.g. 12345" className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Strength</label>
                <input type="text" value={strength} onChange={e => setStrength(e.target.value)}
                       placeholder="e.g. 1500000000" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Defense</label>
                <input type="text" value={defense} onChange={e => setDefense(e.target.value)}
                       placeholder="e.g. 1200000000" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Speed</label>
                <input type="text" value={speed} onChange={e => setSpeed(e.target.value)}
                       placeholder="e.g. 800000000" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Dexterity</label>
                <input type="text" value={dexterity} onChange={e => setDexterity(e.target.value)}
                       placeholder="e.g. 900000000" className={inputClass} />
              </div>
            </div>
            <button type="submit" disabled={submitting}
                    className="w-full px-4 py-2.5 bg-torn-green text-white text-sm font-semibold rounded-lg hover:bg-torn-green/90 transition-colors disabled:opacity-50">
              {submitting ? 'Submitting...' : 'Submit Spy Report'}
            </button>
          </form>

          {error && <div className="bg-danger/10 border border-danger/30 rounded-lg p-2 text-xs text-danger">{error}</div>}
          {success && <div className="bg-torn-green/10 border border-torn-green/30 rounded-lg p-2 text-xs text-torn-green">Spy report submitted! This is now the most trusted data for this player.</div>}
        </div>
      )}
    </div>
  );
}
