## 2026-05-21 - Memoization in Tables
**Learning:** In React, rendering lists of components (like EnemyCard or MemberCard) within a table that has sort/filter state causes full re-renders of all items when the state changes.
**Action:** Wrap row components in React.memo and use useCallback for handlers passed to them.
## 2025-05-23 - Table Row Memoization Performance
**Learning:** Extracting large, complex table rows into their own memoized components (`React.memo`) is critical for performance when the parent table handles rapidly changing state (like sorting, filtering, or expanding rows). Without memoization, a change to one row or the sort order forces a full re-render of N expensive table rows.
**Action:** When building data tables that map over arrays of data, separate the row rendering into a memoized `<TableRow>` component and ensure all callbacks passed to it are wrapped in `useCallback` to preserve referential stability.
