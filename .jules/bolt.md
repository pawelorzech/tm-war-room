## 2025-05-20 - Memoizing list item cards
**Learning:** Wrapping individual item components with `React.memo()` effectively cuts down re-renders on components mapping large arrays. Additionally, when using `useMemo` make sure array values don't re-calculate continuously and depend closely on changes (like `detail?.members`).
**Action:** Use `React.memo` for complex components mapped within tables/lists like `MemberCard` and `EnemyCard` to ensure rendering performance stays smooth for dynamic data tables.
