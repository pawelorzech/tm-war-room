# Feature Plan: Community-Inspired Enhancements for TM Hub

**Date:** 2026-04-06
**Based on:** [Torn Forum Tools & Userscripts Research](../../research/2026-04-06-torn-forum-tools-research.md)
**Source:** 85 threads from forum pages 1-3, detailed analysis of 8 tools

---

## Context

The Torn community has built dozens of tools solving real player problems. Many overlap with TM Hub's existing pages but go deeper. This plan identifies the highest-value features we can absorb, organized by existing page enhancement vs. new pages.

---

## Feature Areas

### 1. War Payout Calculator + Dibs System — `/wars`

**Demand:** War Panel (R:117) + ArmaSync (R:133) + Dibs (R:104) + CAT Calling (R:50) + War Stuff Enhanced (R:81) + Debriefing (R:134) = **combined R:619**

**What exists in community:**
- **War Payout Calculator** (ArmaSync): hit-based + respect-based payout methods for fair reward distribution
- **Dibs system** (War Panel): members claim targets so nobody double-attacks
- **War calling**: coordinator marks "hit this target now" for the faction
- **Extended war reports + AI** (Debriefing): post-war analysis with AI-generated insights
- **Real-time enemy monitoring**: status tracking (online/hosp/jail/travel) with countdown timers
- **Participation tracking**: per-member hit count, respect earned, who didn't participate

**What TM Hub has now:** Basic war page with enemy faction overview.

**Implementation plan:**

| Phase | Feature | Effort | Value |
|-------|---------|--------|-------|
| A | **War Payout Calculator** — hit-based + respect-based split, configurable weights, export | Small | High |
| B | **Dibs system** — claim targets, see who's claimed, release after hosp | Medium | High |
| C | **Participation report** — per-member hits/respect/assists during war | Small | High |
| D | **Enemy status monitor** — real-time status with countdown timers, refresh 30s | Medium | High |
| E | **Post-war report** — summary stats, MVPs, timeline, exportable | Medium | Medium |

**Data sources:** Torn API v2 faction attacks, ranked war data. All available with existing API permissions.

**Priority:** HIGH — core faction need, multiple tools with 100+ rating each.

---

### 2. Stock Advisor / Signals — `/stocks`

**Demand:** Stock Advisor (R:21) + TSIA (R:88) + Stock Manager V7 (R:41) + Stock Analyzer (R:8) = **combined R:158**

**What exists in community:**
- **BUY/SELL/HOLD signals** based on RSI(14), SMA(7), SMA(20), momentum score
- **Benefit Block ROI calculator** with annual return estimates per stock
- **Bank vs Stock comparison** — Investment Bank APR compared to BB payout ROI
- **Portfolio P/L tracking** across all positions
- **Dividend tracking** — unclaimed dividends, progress to next payout
- **Market scan** — all stocks ranked by momentum, signal direction, ROI

**What TM Hub has now:** Basic stocks page with portfolio overview.

**Implementation plan:**

| Phase | Feature | Effort | Value |
|-------|---------|--------|-------|
| A | **Benefit Block ROI table** — annual return per BB, ranked, with cost | Small | High |
| B | **Bank vs Stock comparison** — live bank APRs vs BB payouts, "which is better?" | Small | High |
| C | **Portfolio P/L** — current value vs purchase price, percentage gain/loss | Small | Medium |
| D | **Technical signals** — SMA, RSI, momentum from Tornsy.com OHLC data | Medium | Medium |
| E | **Market scan dashboard** — all stocks ranked by signal + ROI | Medium | Medium |

**Data sources:** Torn API (stocks, user stocks, bank rates) + Tornsy.com (free OHLC candles, no key needed).

**Priority:** MEDIUM-HIGH — clear user need, relatively easy to implement.

---

### 3. OC 2.0 Flowcharts + Analytics — `/oc`

**Demand:** OC Weights Under Roles (R:141) + OC Scenario Tracker (R:100) + OC Analytics (R:65) + OC Dashboard (R:40) + OC Metrics (R:24) + OC Delay Tracker (R:6) = **combined R:376**

**What exists in community:**
- **Interactive scenario flowcharts** — branching decision trees with good/bad endings, rewards per path
- **Role weights** — which roles matter most at each decision point
- **Success chance calculator** — probability based on member skills and role assignments
- **Per-member OC metrics** — completion count, success rate, contribution
- **Delay tracker** — who's holding up the OC
- **Reward analysis** — which endings pay the most

**What TM Hub has now:** Basic OC page with faction organized crimes overview.

**Implementation plan:**

| Phase | Feature | Effort | Value |
|-------|---------|--------|-------|
| A | **OC flowcharts** — interactive visual maps per scenario from OC Tracker API | Medium | Very High |
| B | **Role weights display** — which roles are critical, pulled from API | Small | High |
| C | **Per-member OC stats** — completion count, success rate, delay count | Medium | High |
| D | **Success chance estimator** — based on assigned member skills vs role weights | Medium | Medium |
| E | **Best reward paths** — highlight highest-paying endings per scenario | Small | Medium |

**Data sources:** OC Scenario Tracker public API (`/api/GetRoleWeights`), Torn API v2 faction crimes data. Crimes Hub Firebase data at `crimeshub-2b4b0.firebaseapp.com`.

**Priority:** HIGH — very popular topic, strong visual wow factor with flowcharts.

---

### 4. Travel Planner — `/travel`

**Demand:** Travel Planner (R:107) + DroqsDB (R:117) = **combined R:224**

**What exists in community:**
- **Full-day travel optimizer** — start/end time, max profit/hr route planning
- **Live market prices** for accurate profit calculation
- **Energy/nerve waste limiter** — avoid losing regen on long flights
- **Drug cooldown integration** — plan Swiss detox trips
- **11 destinations, 5 item categories** with filtering
- **4 travel methods** — Standard, Airstrip, Private, Business Class
- **Stock level predictions** abroad (premium)
- **Handbook** — educational guide on travel upgrades

**What TM Hub has now:** Basic travel page with abroad items overview.

**Implementation plan:**

| Phase | Feature | Effort | Value |
|-------|---------|--------|-------|
| A | **Profit calculator per destination** — current market prices × capacity, profit/hr | Medium | High |
| B | **Best runs ranking** — top 10 most profitable trips right now | Small | High |
| C | **Full-day planner** — optimized schedule from start to end time | Large | Very High |
| D | **Travel method comparison** — Standard vs Airstrip vs Private vs BC profit comparison | Small | Medium |
| E | **Energy waste display** — how much E/N you lose per flight duration | Small | Medium |
| F | **Drug cooldown timer** — when cooldown expires, plan detox | Medium | Medium |

**Data sources:** Torn API (items abroad, market prices, user travel status).

**Priority:** MEDIUM-HIGH — high demand, Phase A+B are quick wins.

---

### 5. Crimes 2.0 Dashboard — New Page `/crimes`

**Demand:** Pickpocket JARVIS (R:373) + Arson Bang for Buck (R:209) + Cracking Helper (R:72) + Merit Tracker (R:18) = **combined R:672**

**What exists in community:**
- **Crime optimizer** — which crime gives best $/XP per energy unit
- **Arson calculator** — most efficient buildings (damage vs energy cost)
- **Cracking helper** — code-breaking assistance
- **Merit progress tracker** — how far from each crime merit
- **Pickpocket intelligence** — which targets are most profitable

**What TM Hub has now:** Nothing for Crimes 2.0.

**Implementation plan:**

| Phase | Feature | Effort | Value |
|-------|---------|--------|-------|
| A | **Crime profit/XP table** — all crimes ranked by $/energy and XP/energy | Medium | Very High |
| B | **Arson calculator** — building types, damage efficiency, optimal strategy | Medium | High |
| C | **Crime merit tracker** — progress bars for each crime merit category | Medium | High |
| D | **Educational guides** — how each crime type works, optimal strategies, tips | Small | Medium |
| E | **Pickpocket analysis** — target selection guidance | Medium | Medium |

**Data sources:** Torn API v2 crimes data, community wikis for crime formulas.

**Priority:** HIGH — highest combined demand (R:672!), completely new page = attracts new users.

---

## Additional Feature Ideas (Lower Priority)

### 6. Faction Intelligence Enhancements

**Source:** Torn Intel (R:18 but new + powerful), torn.report (R:801)

| Feature | Effort | Value |
|---------|--------|-------|
| Activity heatmap (hour × day for each member) | Medium | High |
| Faction comparison (us vs enemy: avg BS, activity) | Medium | High |
| Recruitment scanner (find players by BS/level/activity) | Large | Medium |
| Gym training tracker (who trains what) | Medium | Medium |
| Armory tracking (who borrows what) | Medium | Medium |

### 7. Market Improvements

**Source:** torn.bzimor.dev (R:190), Show Bazaar Listings (R:590), RW Trading (R:16)

| Feature | Effort | Value |
|---------|--------|-------|
| Item price history charts | Large | High |
| Bazaar aggregator | Large | High |
| Flip profit tracker | Medium | Medium |
| RW cache analysis | Medium | Medium |

### 8. Revive & Bust System

**Source:** Nuke REVIVE ME (R:306), Bust Reminder (R:150)

| Feature | Effort | Value |
|---------|--------|-------|
| Push notification for faction revive requests | Medium | High |
| Bust reminder timer (who to bust, when) | Small | Medium |
| Revive status tracker for faction members | Small | Medium |

### 9. Chain Management

**Source:** ChainWatch Pro (R:21), Faction Chains (R:17)

| Feature | Effort | Value |
|---------|--------|-------|
| Chain timer with bonus tracker | Medium | High |
| Chain participation per member | Small | High |
| Chain target suggestions (easy wins) | Medium | Medium |

### 10. Personal Log Analysis

**Source:** torn.report original (R:801)

| Feature | Effort | Value |
|---------|--------|-------|
| Mugging report (totals, best targets) | Medium | Medium |
| City finds summary | Small | Low |
| Energy usage analysis | Medium | Medium |

---

## Implementation Roadmap

### Wave 1 — Quick Wins (1-2 weeks each)
1. War Payout Calculator (Phase A) — simple calculation, high demand
2. Stock BB ROI table + Bank comparison (Phases A+B) — tiny effort, high value
3. Best travel runs ranking (Phase B) — uses existing market data
4. OC role weights display (Phase B) — pull from public API

### Wave 2 — Core Features (2-4 weeks each)
5. Crimes 2.0 Dashboard (Phases A+B) — new page, biggest untapped demand
6. War Dibs system (Phase B) — requires new DB table + real-time UI
7. OC Flowcharts (Phase A) — visual wow factor, uses public API data
8. Stock technical signals (Phase D) — Tornsy.com integration

### Wave 3 — Advanced Features (4+ weeks each)
9. Full-day travel planner (Phase C) — complex optimization algorithm
10. War enemy status monitor (Phase D) — real-time polling
11. Faction comparison dashboard — new analytics page
12. Activity heatmap — frontend visualization

---

## Competitive Landscape Summary

| Competitor | Strength | Our Advantage |
|------------|----------|---------------|
| Torn Intel | Deep faction analytics (217+ stats, heatmaps) | We're free, faction-focused, no freemium wall |
| FFScouter | Stat prediction, target lists, War Room | We can integrate their public API |
| torn.report | Log analysis, beautiful charts | We can build similar with faction-wide perspective |
| ArmaSync | War payouts | We can integrate directly into war page |
| Travel Planner | Day optimization | We can bundle with our existing travel data |
| Crimes Hub | OC flowcharts | We can embed + add faction-specific analytics |

**TM Hub's unique advantage:** We're a single integrated platform. Users currently need 5-10 different tools (scripts, sites, spreadsheets, bots). We can offer everything in one place with a consistent UI and shared data model.

---

## Decision Required

Which wave/features to prioritize? Factors to consider:
- **User impact:** Crimes 2.0 + War tools have highest demand
- **Effort:** Stock BB ROI and Travel ranking are quickest wins
- **Differentiation:** OC Flowcharts and Faction Intelligence are most visually impressive
- **Retention:** War tools (payouts, dibs) create daily faction engagement
