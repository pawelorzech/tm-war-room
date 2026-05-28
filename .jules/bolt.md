## 2026-05-21 - Memoization in Tables
**Learning:** In React, rendering lists of components (like EnemyCard or MemberCard) within a table that has sort/filter state causes full re-renders of all items when the state changes.
**Action:** Wrap row components in React.memo and use useCallback for handlers passed to them.
## 2026-05-21 - Memoization in Tables
**Learning:** In React, rendering lists of components (like EnemyCard or MemberCard) within a table that has sort/filter state causes full re-renders of all items when the state changes.
**Action:** Wrap row components in React.memo and use useCallback for handlers passed to them.

## 2026-05-28 - Correct Memoization Prop Passing
**Learning:** When memoizing list row components, passing parent state that targets a specific item (e.g. `expandedId`) directly to every row causes all rows to re-render when the selection changes, defeating the purpose of React.memo.
**Action:** Pass a derived boolean prop instead (e.g., `isExpanded={expandedId === m.id}`).

## 2026-05-28 - Avoid Intervals in Row Components
**Learning:** Placing `setInterval` inside individual row components creates massive performance degradation in large tables due to dozens of active intervals triggering independent re-renders.
**Action:** Compute necessary time values statically in the parent and pass them down as props or boolean derived variables.
