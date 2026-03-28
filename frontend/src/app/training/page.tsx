'use client';

import { useState } from 'react';
import { useCalculator } from '@/hooks/useCalculator';
import { useTrainingStats } from '@/hooks/useTrainingStats';

import { RecommendationsPanel } from '@/components/training/RecommendationsPanel';
import { ComparisonToggle } from '@/components/training/calculator/ComparisonToggle';

import { Section01_GettingStarted } from '@/components/training/guide/Section01_GettingStarted';
import { Section02_GymFormula } from '@/components/training/guide/Section02_GymFormula';
import { Section03_HappyJumping } from '@/components/training/guide/Section03_HappyJumping';
import { Section04_GymProgression } from '@/components/training/guide/Section04_GymProgression';
import { Section05_EnergyManagement } from '@/components/training/guide/Section05_EnergyManagement';
import { Section06_StatEnhancers } from '@/components/training/guide/Section06_StatEnhancers';
import { Section07_CompanyPerks } from '@/components/training/guide/Section07_CompanyPerks';
import { Section08_MeritsAndBooks } from '@/components/training/guide/Section08_MeritsAndBooks';
import { Section09_TrainingBreak } from '@/components/training/guide/Section09_TrainingBreak';

import type { EnergySources, BookBonus } from '@/types/training';

import dynamic from 'next/dynamic';

const StatProjectionChart = dynamic(
  () => import('@/components/training/charts/StatProjectionChart').then(m => ({ default: m.StatProjectionChart })),
  { ssr: false, loading: () => <div className="h-64 bg-bg-card rounded-lg animate-pulse" /> }
);

const NAV_ITEMS = [
  { id: 'calculator', label: 'Calculator', icon: '🧮' },
  { id: 'basics', label: 'Getting Started', icon: '📖' },
  { id: 'happy', label: 'Happy Jumping', icon: '😊' },
  { id: 'gyms', label: 'Gyms', icon: '🏋️' },
  { id: 'energy', label: 'Energy', icon: '⚡' },
  { id: 'enhancers', label: 'SE vs Xanax', icon: '💊' },
  { id: 'companies', label: 'Companies', icon: '🏢' },
  { id: 'merits', label: 'Merits & Books', icon: '📚' },
  { id: 'war', label: 'War Prep', icon: '🛡️' },
] as const;

type NavId = (typeof NAV_ITEMS)[number]['id'];

function formatStat(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export default function TrainingPage() {
  const { data: apiData, loading: statsLoading } = useTrainingStats();
  const { state, updateField, results } = useCalculator(apiData);
  const [activeSection, setActiveSection] = useState<NavId>('calculator');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activeItem = NAV_ITEMS.find(i => i.id === activeSection)!;

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col w-[200px] shrink-0 sticky top-0 h-screen border-r border-border bg-bg-surface/50">
          <div className="px-4 pt-5 pb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Training Guide</h2>
          </div>
          <nav className="flex-1 overflow-y-auto px-2 pb-4">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 mb-0.5 ${
                  activeSection === item.id
                    ? 'bg-torn-green/15 text-torn-green font-semibold shadow-[inset_2px_0_0_0] shadow-torn-green'
                    : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
                }`}
              >
                <span className="text-base leading-none">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Mobile nav bar */}
        <div className="md:hidden fixed top-12 left-0 right-0 z-30 bg-bg-surface/95 backdrop-blur border-b border-border">
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm"
          >
            <span className="flex items-center gap-2">
              <span>{activeItem.icon}</span>
              <span className="font-semibold text-text-primary">{activeItem.label}</span>
            </span>
            <svg
              className={`w-4 h-4 text-text-secondary transition-transform duration-200 ${mobileNavOpen ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {mobileNavOpen && (
            <div className="border-t border-border bg-bg-surface px-2 py-2 max-h-[60vh] overflow-y-auto">
              {NAV_ITEMS.map(item => (
                <button
                  key={item.id}
                  onClick={() => { setActiveSection(item.id); setMobileNavOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 mb-0.5 ${
                    activeSection === item.id
                      ? 'bg-torn-green/15 text-torn-green font-semibold'
                      : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content area */}
        <main className="flex-1 min-w-0 pt-[52px] md:pt-0">
          <div className="max-w-4xl mx-auto px-4 py-6">
            {/* Stats status banner */}
            {statsLoading && (
              <div className="mb-4 px-4 py-2.5 rounded-lg bg-bg-card border border-torn-green/20 text-text-secondary text-sm animate-pulse">
                Loading your stats...
              </div>
            )}
            {!statsLoading && apiData && (
              <div className="mb-4 px-4 py-2.5 rounded-lg bg-torn-green/10 border border-torn-green/30 text-sm text-text-primary flex flex-wrap gap-x-4 gap-y-1 items-center">
                <span className="font-semibold text-torn-green">{apiData.profile.name}</span>
                <span className="text-text-secondary">STR: <span className="text-text-primary font-medium">{formatStat(apiData.battlestats.strength)}</span></span>
                <span className="text-text-secondary">DEF: <span className="text-text-primary font-medium">{formatStat(apiData.battlestats.defense)}</span></span>
                <span className="text-text-secondary">SPD: <span className="text-text-primary font-medium">{formatStat(apiData.battlestats.speed)}</span></span>
                <span className="text-text-secondary">DEX: <span className="text-text-primary font-medium">{formatStat(apiData.battlestats.dexterity)}</span></span>
                <span className="text-xs text-text-secondary ml-auto">Stats auto-loaded</span>
              </div>
            )}

            {/* Calculator */}
            {activeSection === 'calculator' && (
              <div className="space-y-6">
                <Section02_GymFormula
                  state={state}
                  results={results}
                  onUpdate={updateField}
                  apiPopulated={!!apiData}
                />

                <RecommendationsPanel recommendations={results.recommendations} />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <section className="bg-bg-card rounded-lg p-4 sm:p-6 border border-torn-green/20">
                    <h2 className="text-lg font-bold text-text-primary mb-4">Stat Projection</h2>
                    <StatProjectionChart
                      currentStat={state.currentStat}
                      gainPerDay={results.gainPerDay}
                    />
                  </section>

                  <section className="bg-bg-card rounded-lg p-4 sm:p-6 border border-torn-green/20">
                    <h2 className="text-lg font-bold text-text-primary mb-4">What If...?</h2>
                    <ComparisonToggle
                      state={state}
                      results={results}
                      onUpdate={updateField}
                    />
                  </section>
                </div>
              </div>
            )}

            {activeSection === 'basics' && <Section01_GettingStarted />}

            {activeSection === 'happy' && (
              <Section03_HappyJumping
                currentStat={state.currentStat}
                happy={state.happy}
                happyContributionPercent={results.happyContributionPercent}
              />
            )}

            {activeSection === 'gyms' && (
              <Section04_GymProgression
                currentStat={state.currentStat}
                gymDots={state.gymDots}
                trainedStat={state.trainedStat}
              />
            )}

            {activeSection === 'energy' && (
              <Section05_EnergyManagement
                energySources={state.energySources}
                onUpdateEnergySources={(sources: EnergySources) => updateField('energySources', sources)}
                gainPerEnergy={results.gainPerEnergy}
                results={results}
              />
            )}

            {activeSection === 'enhancers' && (
              <Section06_StatEnhancers
                currentStat={state.currentStat}
                results={results}
              />
            )}

            {activeSection === 'companies' && (
              <Section07_CompanyPerks
                trainedStat={state.trainedStat}
                companyType={state.companyType}
                onUpdateCompany={(company: string | null) => updateField('companyType', company)}
              />
            )}

            {activeSection === 'merits' && (
              <Section08_MeritsAndBooks
                trainedStat={state.trainedStat}
                meritLevel={state.meritLevel}
                educationBonus={state.educationBonus}
                bookBonus={state.bookBonus}
                onUpdateMerit={(level: number) => updateField('meritLevel', level)}
                onUpdateEducation={(bonus: number) => updateField('educationBonus', bonus)}
                onUpdateBook={(bonus: BookBonus) => updateField('bookBonus', bonus)}
                gainPerDay={results.gainPerDay}
              />
            )}

            {activeSection === 'war' && <Section09_TrainingBreak />}
          </div>
        </main>
      </div>
    </div>
  );
}
