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

const TABS = [
  { id: 'calculator', label: 'Calculator', shortLabel: 'Calc' },
  { id: 'basics', label: 'Getting Started', shortLabel: 'Basics' },
  { id: 'formula', label: 'The Formula', shortLabel: 'Formula' },
  { id: 'happy', label: 'Happy Jumping', shortLabel: 'Happy' },
  { id: 'gyms', label: 'Gyms', shortLabel: 'Gyms' },
  { id: 'energy', label: 'Energy', shortLabel: 'Energy' },
  { id: 'enhancers', label: 'Stat Enhancers', shortLabel: 'SEs' },
  { id: 'companies', label: 'Companies', shortLabel: 'Jobs' },
  { id: 'merits', label: 'Merits & Books', shortLabel: 'Merits' },
  { id: 'war', label: 'War Prep', shortLabel: 'War' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function formatStat(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export default function TrainingPage() {
  const { data: apiData, loading: statsLoading } = useTrainingStats();
  const { state, updateField, results } = useCalculator(apiData);
  const [activeTab, setActiveTab] = useState<TabId>('calculator');

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      {/* Tab Navigation */}
      <nav className="sticky top-0 z-40 bg-bg-secondary/95 backdrop-blur border-b border-torn-green/20">
        <div className="max-w-4xl mx-auto">
          <div className="flex overflow-x-auto scrollbar-hide">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-torn-green text-torn-green'
                    : 'border-transparent text-text-secondary hover:text-text-primary hover:border-text-secondary/30'
                }`}
              >
                <span className="sm:hidden">{tab.shortLabel}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-6">
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

        {/* Calculator Tab */}
        {activeTab === 'calculator' && (
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

        {activeTab === 'basics' && <Section01_GettingStarted />}

        {activeTab === 'formula' && (
          <Section02_GymFormula
            state={state}
            results={results}
            onUpdate={updateField}
            apiPopulated={!!apiData}
          />
        )}

        {activeTab === 'happy' && (
          <Section03_HappyJumping
            currentStat={state.currentStat}
            happy={state.happy}
            happyContributionPercent={results.happyContributionPercent}
          />
        )}

        {activeTab === 'gyms' && (
          <Section04_GymProgression
            currentStat={state.currentStat}
            gymDots={state.gymDots}
            trainedStat={state.trainedStat}
          />
        )}

        {activeTab === 'energy' && (
          <Section05_EnergyManagement
            energySources={state.energySources}
            onUpdateEnergySources={(sources: EnergySources) => updateField('energySources', sources)}
            gainPerEnergy={results.gainPerEnergy}
            results={results}
          />
        )}

        {activeTab === 'enhancers' && (
          <Section06_StatEnhancers
            currentStat={state.currentStat}
            results={results}
          />
        )}

        {activeTab === 'companies' && (
          <Section07_CompanyPerks
            trainedStat={state.trainedStat}
            companyType={state.companyType}
            onUpdateCompany={(company: string | null) => updateField('companyType', company)}
          />
        )}

        {activeTab === 'merits' && (
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

        {activeTab === 'war' && <Section09_TrainingBreak />}
      </main>
    </div>
  );
}
