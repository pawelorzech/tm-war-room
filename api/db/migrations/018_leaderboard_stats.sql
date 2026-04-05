-- Add gym_trains and easter_eggs tracking for leaderboard competitions
ALTER TABLE stat_snapshots ADD COLUMN gym_trains INTEGER;
ALTER TABLE stat_snapshots ADD COLUMN stat_enhancers_used INTEGER;
ALTER TABLE stat_snapshots ADD COLUMN easter_eggs INTEGER;
