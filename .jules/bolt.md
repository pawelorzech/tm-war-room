## 2026-05-21 - Memoization in Tables
**Learning:** In React, rendering lists of components (like EnemyCard or MemberCard) within a table that has sort/filter state causes full re-renders of all items when the state changes.
**Action:** Wrap row components in React.memo and use useCallback for handlers passed to them.

## 2024-05-22 - Memoization and Volatile Props
**Learning:** Extracting list rows into `React.memo` components is ineffective if the parent component passes a continuously changing primitive prop (like a timestamp `now = Math.floor(Date.now() / 1000)` calculated on every render). The changing prop will break the shallow comparison and trigger full re-renders anyway.
**Action:** Push volatile calculations (like timestamps) down into the child component rather than passing them as props from the parent to preserve memoization effectiveness.
