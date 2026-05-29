// Pure hospital-release transition detector.
//
// No DOM, no I/O — just set arithmetic. Given the set of player ids that WERE
// hospitalized last tick (`prev`), the set hospitalized this tick (`now`), and
// the set the user cares about (`watched`), return the watched ids that left
// the hospital between ticks (in prev, not in now). The caller toasts a
// one-click attack link for each so the user can be first to mug them.

/**
 * @param prev   player ids that were hospitalized last tick
 * @param now    player ids hospitalized this tick
 * @param watched player ids the user cares about (targets ∪ stakeouts)
 * @returns watched ids that were in `prev` but are no longer in `now`
 */
export function detectReleased(
  prev: Set<number>,
  now: Set<number>,
  watched: Set<number>,
): number[] {
  const released: number[] = [];
  for (const id of prev) {
    if (watched.has(id) && !now.has(id)) released.push(id);
  }
  return released;
}
