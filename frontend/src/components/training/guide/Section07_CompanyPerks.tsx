'use client';

import { TRAINING_COMPANIES } from '@/lib/constants';
import type { StatType } from '@/types/training';

interface Section07Props {
  trainedStat: StatType;
  companyType: string | null;
  onUpdateCompany: (company: string | null) => void;
}

function getRecommendation(stat: StatType): { text: string; company: string } {
  switch (stat) {
    case 'DEF':
      return {
        company: 'Ladies Strip Club',
        text: 'Join Ladies Strip Club 7-star: +10% DEF gym gains + 25% passive DEF',
      };
    case 'DEX':
      return {
        company: 'Gents Strip Club',
        text: 'Join Gents Strip Club 7-star: +10% DEX gym gains + 25% passive DEX',
      };
    case 'STR':
      return {
        company: 'Furniture Store',
        text: 'Join Furniture Store 7-star for +25% passive STR, or Fitness Center 10-star for +3% all',
      };
    case 'SPD':
      return {
        company: 'Gas Station',
        text: 'Join Gas Station 3-star for +25% passive SPD',
      };
  }
}

function isPerkRelevant(perk: { stat?: string }, trainedStat: StatType): boolean {
  if (!('stat' in perk) || !perk.stat) return false;
  return perk.stat === trainedStat || perk.stat === 'ALL';
}

export function Section07_CompanyPerks({ trainedStat, companyType, onUpdateCompany }: Section07Props) {
  const recommendation = getRecommendation(trainedStat);

  const selectedCompany = companyType
    ? TRAINING_COMPANIES.find((c) => c.name === companyType) ?? null
    : null;

  const activePerks = selectedCompany ? selectedCompany.perks : [];

  return (
    <section id="company-perks" className="space-y-6">
      <h2 className="text-2xl font-bold text-text-primary border-b border-text-secondary/20 pb-3">
        Company Perks for Training
      </h2>

      {/* Intro */}
      <div className="space-y-3 text-text-primary leading-relaxed">
        <p>
          Your job company gives permanent perks as you and your coworkers increase its star level.
          Some of those perks directly boost your gym gains or passively increase your battle stats.
          Choosing the right company for your training focus is a big deal.
        </p>
        <p>
          Perks stack <strong>multiplicatively</strong> with Steadfast, books, and merits. A +10% gym
          gain perk doesn&apos;t just add 10% — it multiplies on top of everything else.
        </p>
      </div>

      {/* Recommendation box */}
      <div className="bg-bg-card border border-torn-green/40 rounded-xl p-5 flex gap-3 items-start">
        <span className="text-torn-green text-xl mt-0.5 shrink-0">★</span>
        <div>
          <p className="font-semibold text-torn-green mb-1">
            Best pick for {trainedStat} training
          </p>
          <p className="text-text-primary text-sm">{recommendation.text}</p>
        </div>
      </div>

      {/* Company selector */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-text-secondary">
          Your current company
        </label>
        <select
          value={companyType ?? ''}
          onChange={(e) => onUpdateCompany(e.target.value || null)}
          className="w-full sm:w-72 bg-bg-card border border-text-secondary/30 rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-torn-green"
        >
          <option value="">None / Not relevant</option>
          {TRAINING_COMPANIES.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>

        {selectedCompany && activePerks.length > 0 && (
          <div className="mt-3 bg-bg-secondary border border-text-secondary/20 rounded-xl p-4 space-y-2">
            <p className="text-sm font-semibold text-torn-green">
              Your company perks — {selectedCompany.name}
            </p>
            <ul className="space-y-1.5">
              {activePerks.map((perk) => {
                const relevant = isPerkRelevant(perk, trainedStat);
                return (
                  <li
                    key={perk.star}
                    className={`flex items-start gap-2 text-sm ${relevant ? 'text-torn-green font-medium' : 'text-text-secondary'}`}
                  >
                    <span className="shrink-0 mt-0.5">{relevant ? '▸' : '·'}</span>
                    <span>
                      <span className="text-text-secondary text-xs mr-1.5">{perk.star}★</span>
                      {perk.effect}
                      {relevant && (
                        <span className="ml-2 text-xs bg-torn-green/20 text-torn-green px-1.5 py-0.5 rounded">
                          active for {trainedStat}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Full company table */}
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-3">All Training Company Perks</h3>
        <div className="overflow-x-auto rounded-xl border border-text-secondary/20">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-secondary border-b border-text-secondary/20">
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Company</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Stars</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Perk</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {TRAINING_COMPANIES.flatMap((company) =>
                company.perks.map((perk, perkIndex) => {
                  const relevant = isPerkRelevant(perk, trainedStat);
                  const rowIndex = TRAINING_COMPANIES.indexOf(company) + perkIndex;
                  return (
                    <tr
                      key={`${company.name}-${perk.star}`}
                      className={`border-b border-text-secondary/10 transition-colors ${
                        relevant
                          ? 'bg-torn-green/10 hover:bg-torn-green/15'
                          : rowIndex % 2 === 0
                          ? 'bg-bg-card hover:bg-bg-secondary/80'
                          : 'bg-bg-secondary hover:bg-bg-secondary/80'
                      }`}
                    >
                      <td className="px-4 py-3 font-medium text-text-primary">
                        {perkIndex === 0 ? company.name : (
                          <span className="text-text-secondary text-xs italic">↳</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{perk.star}★</td>
                      <td className={`px-4 py-3 ${relevant ? 'text-torn-green font-medium' : 'text-text-primary'}`}>
                        {perk.effect}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          perk.type === 'gymGain'
                            ? 'bg-torn-green/20 text-torn-green'
                            : perk.type === 'passive'
                            ? 'bg-blue-500/20 text-blue-400'
                            : perk.type === 'jpTraining'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-gray-600/40 text-text-secondary'
                        }`}>
                          {perk.type === 'gymGain' ? 'Gym gain' :
                           perk.type === 'passive' ? 'Passive stat' :
                           perk.type === 'jpTraining' ? 'JP training' :
                           perk.type === 'booster' ? 'Booster' : 'Combat'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-text-secondary mt-2">
          Highlighted rows are relevant to your current trained stat ({trainedStat}).
        </p>
      </div>

      {/* TL;DR */}
      <div className="bg-bg-secondary border border-text-secondary/30 rounded-xl p-5">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">TL;DR</p>
        <ul className="space-y-2">
          {[
            'Strip clubs are king for DEF/DEX training — +10% gym gains at 7-star',
            'Fitness Center 10-star is best for all-around (+3% all stats)',
            'Company perks stack multiplicatively with other bonuses',
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-text-primary">
              <span className="text-torn-green mt-0.5 shrink-0">▸</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
