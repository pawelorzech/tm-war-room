-- Track real energy spent on gym from Torn personalstats (gymstrength+gymdefense+gymspeed+gymdexterity)
ALTER TABLE stat_snapshots ADD COLUMN gym_energy INTEGER;
