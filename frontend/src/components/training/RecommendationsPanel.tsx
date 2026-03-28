'use client';
import type { Recommendation } from '@/types/training';

interface RecommendationsPanelProps {
  recommendations: Recommendation[];
}

const priorityColors = {
  high: 'border-danger text-danger',
  medium: 'border-warning text-warning',
  low: 'border-text-secondary text-text-secondary',
};

const categoryIcons: Record<string, string> = {
  energy: '⚡',
  gym: '🏋️',
  company: '🏢',
  items: '📦',
  warning: '⚠️',
};

export function RecommendationsPanel({ recommendations }: RecommendationsPanelProps) {
  if (recommendations.length === 0) return null;

  return (
    <div className="bg-bg-card border border-torn-green/20 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-torn-green mb-3">Recommendations</h3>
      <div className="space-y-3">
        {recommendations.map((rec) => (
          <div
            key={rec.id}
            className={`border-l-2 ${priorityColors[rec.priority]} pl-3 py-1`}
          >
            <div className="flex items-center gap-2">
              <span>{categoryIcons[rec.category] ?? '💡'}</span>
              <span className="font-medium text-sm text-text-primary">{rec.title}</span>
            </div>
            <p className="text-xs text-text-secondary mt-0.5">{rec.description}</p>
            <p className="text-xs font-medium text-torn-green mt-0.5">{rec.impact}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
