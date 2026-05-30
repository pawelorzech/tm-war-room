## 2026-05-21 - Memoization in Tables
**Learning:** In React, rendering lists of components (like EnemyCard or MemberCard) within a table that has sort/filter state causes full re-renders of all items when the state changes.
**Action:** Wrap row components in React.memo and use useCallback for handlers passed to them.

## 2026-05-21 - Extracting Large Rows to memoized components
**Learning:** Extracting complex list row rendering logic into separate `memo`ized components stops React from re-rendering the whole array for single-row state changes like expansion toggles.
**Action:** In tables with complex rows, always extract the `<tr>` block into a `memo`ized component, ensure all callback props are wrapped in `useCallback` at the parent level, and avoid passing item-specific ID states down (instead compute booleans like `isExpanded={expandedId === id}`).
