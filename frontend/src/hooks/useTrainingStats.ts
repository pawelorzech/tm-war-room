"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import type { TornUserData } from "@/types/training";

export function useTrainingStats() {
  const [data, setData] = useState<TornUserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.trainingStats()
      .then((raw) => {
        const mapped: TornUserData = {
          profile: {
            player_id: raw.profile.player_id,
            name: raw.profile.name,
            level: raw.profile.level,
            faction: null,
          },
          battlestats: {
            strength: raw.battlestats.strength,
            defense: raw.battlestats.defense,
            speed: raw.battlestats.speed,
            dexterity: raw.battlestats.dexterity,
            total: raw.battlestats.strength + raw.battlestats.defense + raw.battlestats.speed + raw.battlestats.dexterity,
            strength_modifier: 0,
            defense_modifier: 0,
            speed_modifier: 0,
            dexterity_modifier: 0,
          },
          bars: {
            happy: { current: raw.bars.happy.current, maximum: raw.bars.happy.maximum },
            energy: { current: raw.bars.energy.current, maximum: raw.bars.energy.maximum },
          },
          gym: {
            active_gym: raw.gym.active_gym,
          },
          merits: {
            brawn: raw.merits.brawn,
            protection: raw.merits.protection,
            sharpness: raw.merits.sharpness,
            evasion: raw.merits.evasion,
          },
          personalstats: {
            xantaken: raw.personalstats.xantaken,
            exttaken: 0,
            energydrinkused: 0,
            refills: raw.personalstats.refills,
            statenhancersused: raw.personalstats.statenhancersused,
            rehabs: raw.personalstats.rehabs,
          },
          steadfast: raw.steadfast ?? { strength: 0, defense: 0, speed: 0, dexterity: 0 },
          educationCompleted: raw.educationCompleted ?? [],
          educationPerks: raw.educationPerks ?? [],
          bookPerks: raw.bookPerks ?? [],
        };
        setData(mapped);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load stats");
      })
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}
