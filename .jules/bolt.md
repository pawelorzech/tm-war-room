## 2026-05-21 - Memoization in Tables
**Learning:** In React, rendering lists of components (like EnemyCard or MemberCard) within a table that has sort/filter state causes full re-renders of all items when the state changes.
**Action:** Wrap row components in React.memo and use useCallback for handlers passed to them.
## 2026-05-27 - Extract row rendering to memoized components for large tables
**Learning:** In large React tables like `MemberTable` and `EnemyTable`, updating a minor state (like `expandedId` or an off-limit entry) caused expensive re-renders for every row because the row rendering logic was inline and new callback references were generated on each render.
**Action:** Extract row logic into a separate `React.memo()` component (e.g., `MemberTableRow`). Ensure all parent callbacks passed down (e.g., `toggleExpanded`, `copyBounty`) are wrapped in `useCallback` to preserve referential equality and prevent re-rendering unchanged rows.
