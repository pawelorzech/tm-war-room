## 2026-05-21 - Memoization in Tables
**Learning:** In React, rendering lists of components (like EnemyCard or MemberCard) within a table that has sort/filter state causes full re-renders of all items when the state changes.
**Action:** Wrap row components in React.memo and use useCallback for handlers passed to them.

## 2024-05-24 - [Avoid inline arrow functions with React.memo]
**Learning:** When passing a callback function to a React child component that is wrapped in `React.memo()`, using an inline arrow function in JSX (e.g. `onRequestEdit={(e) => handleRequestEdit(e, m)}`) defeats memoization because the arrow function creates a new reference on every single render. This forces the child to re-render even if its other props haven't changed.
**Action:** When a child component needs context from the map iteration (like the current `member` `m`), change the child component's prop signature so it accepts that context (e.g. `(entry: WarOffLimits, member: EnemyMember) => void`). Then, pass the stable parent function directly (`onRequestEdit={handleRequestEdit}`) and have the child pass the arguments back.
