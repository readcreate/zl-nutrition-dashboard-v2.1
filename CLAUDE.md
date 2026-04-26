# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A static, client-side-only HTML/JS dashboard for PIH Haiti's nutrition program. There is no build step, no server, no package manager, and no tests. Open any `.html` file directly in a browser to run it.

The UI is bilingual (French primary, English secondary). French strings appear first throughout the codebase.

## How to run

Open `index.html` in a browser. No server required. For drag-and-drop file upload to work reliably, serve via a local HTTP server:

```
python -m http.server 8080
# then open http://localhost:8080
```

## Pages

| File | Nav label | activeId | Purpose |
|---|---|---|---|
| `index.html` | Données / Upload Data | `upload` | CommCare file upload |
| `analytics.html` | Vue d'ensemble / Overview | `analytics` | Summary stats, admission trend, cohort outcomes, program origins, supplement gap, outcomes table |
| `profiles.html` | Profils & Résultats / Profiles & Outcomes | `profiles` | Site performance, nutritional status, weight gain, patient profiles (age/sex/BF/vax), LOS, geographic |
| `pathways.html` | Parcours & Qualité / Pathways & Quality | `pathways` | Patient trajectories, care pathway combinations, visit counts, data quality |

The `activeId` string is passed to `buildNav(activeId)` in each page's inline `<script>` at the bottom.

Other HTML files (`chw.html`, `clinical.html`, `supervisor.html`, `nextsteps.html`) exist but are **not in the nav** and are not actively maintained.

## Architecture

### Data flow

1. **`index.html`** — User drops one or more CommCare `.xlsx` export files. `parser.js` parses them client-side using SheetJS (`xlsx@0.18.5` from CDN). The parsed data object is stored in `sessionStorage` as `pih_nutrition_data`.
2. **`analytics.html`**, **`profiles.html`**, **`pathways.html`** — All three read `pih_nutrition_data` from `sessionStorage` on load, and render their respective sections using `analytics.js`.

If `sessionStorage` is full (large files), the upload page truncates to 5,000 cases as a fallback.

### sessionStorage data shape

```js
{
  meta: { files, caseCount, programCounts: { PNS, PTA, USN }, loadedAt },
  cases: [ /* array of case objects */ ],
  suppMonthly: { /* supplement gap data keyed by month */ },
  dqReport: { /* data quality counts */ }
}
```

Each **case** object:
```js
{
  id, site, dept, commune, sex, ageMonths, regDate, breastfeeding, vaccinated,
  pns: { admDate, exitDate, outcome, losdays, admWeight, exitWeight, weightGainG,
         visitCount, origine, admOedema, admPT, admMUAC, suppRec, suppDel } | null,
  pta: { /* same fields */ } | null,
  usn: { /* same fields */ } | null,
}
```

`outcome` values: `'Guéri'` | `'Abandon'` | `'Transféré'` | `'Décédé'` | `null` (still active).

### Episode vs Case

Most render functions work on a flat **episodes** array (one entry per program enrollment per case), produced by `getFilteredEpisodes(cases, range)` in `analytics.js`. A few functions that need cross-program data per child (trajectory flow, care pathway, visit counts) take the raw `cases` array directly and do their own date-range filtering.

### JS files

- **`js/parser.js`** — Parses raw CommCare `.xlsx` workbooks. Entry point: `parseFiles(fileList)` → returns `{ meta, cases, suppMonthly, dqReport }`. Handles multi-file merging (deduplicates by `formid`). Expected sheets: `Enregistrement`, `Visite PNS`, `Visite PTA`, `Visite USN`, `Exeat PNS`, `Exeat PTA`, `Exeat USN`, `Dictionnaire`. Cases keyed by `form.case.@case_id`.
- **`js/analytics.js`** — All rendering logic for the three analytics pages. Shared via `<script src="js/analytics.js">` on each page. Key render functions (all guard with `if (!el) return`):
  - `renderSummaryStats(episodes)` — stat cards (analytics.html only)
  - `renderEnrollmentTrend(episodes)` — admissions by month bar chart
  - `renderCohortOutcomes(episodes)` — stacked outcome bars by cohort month
  - `renderProgramFlow(episodes)` — admission origins
  - `renderSuppGap(suppMonthly, range)` — supplement gap chart
  - `renderLOS(episodes)` — length of stay distribution
  - `renderGeographic(episodes)` — admissions by site
  - `renderOutcomesTable(episodes)` — outcomes summary table with recovery rate
  - `renderPTChart(episodes)` — P/T nutritional status at admission
  - `renderWeightGainChart(episodes)` — weight gain at discharge distribution
  - `renderPatientProfiles(episodes)` — age group distribution
  - `renderBreastfeedingVax(episodes)` — breastfeeding & vaccination status
  - `renderSitePerformance(episodes)` — site performance table
  - `renderCarePathway(cases, range)` — program combination bar chart + visit count distribution
  - `renderTrajectoryFlow(cases, range)` — ordered patient trajectory paths with final outcome, grouped by starting program
  - `renderDataQuality(dqReport, episodes)` — missing/implausible value cards
  - `exportCSV(rows, filename)` / `episodesToCSV(episodes)` / `sitePerformanceToCSV(episodes)` — CSV export helpers. `render()` wires `#export-btn`, `#outcomes-export-btn`, and `#site-export-btn` to these after each render.
- **`js/data.js`** — Synthetic demo/fallback data (not used when real CommCare data is loaded).
- **`js/shared.js`** — `buildNav(activeId)` (4-link nav), `programTag`, `progressBar`, `renderBarChart`.

### Critical pattern: null guards in render functions

**Every** render function must guard against missing DOM elements at the top:
```js
function renderFoo(episodes) {
  const el = document.getElementById('foo-chart');
  if (!el) return;  // ← required — element may not exist on current page
  ...
}
```
The exception is `renderSummaryStats`, which also has this guard. Without it, a `TypeError` on a missing element will silently abort the entire `render()` call and leave all subsequent charts blank. This was a real bug: `renderSummaryStats` originally lacked the guard, breaking `profiles.html` and `pathways.html`.

### init() and render() flow

`analytics.js` runs `init()` on `DOMContentLoaded`. `init()`:
1. Loads data from `sessionStorage`
2. If no data → shows `#no-data-banner`, hides `#analytics-content`, returns
3. If data → populates `#data-meta` in the date bar, shows `#analytics-content`, calls `initDateControls()`, activates the "Tout / All" quick-date button as default, then calls `render()`

`render()` calls all render functions. Functions whose target elements don't exist on the current page return immediately due to the null guard.

### Programs

- **USN** — Inpatient SAM (Severe Acute Malnutrition). Overdue threshold: 7 days.
- **PTA** — Outpatient SAM. Overdue threshold: 14 days.
- **PNS** — Preventive/MAM (Moderate Acute Malnutrition). Overdue threshold: 14 days.

### Risk scoring (`computeRisk` in `data.js`)

Scored 0–N on: days overdue vs. program threshold, oedema, MUAC decline, low absolute MUAC, and weight gain rate (g/kg/day). Maps to `critical / high / moderate / low`.

## CSS

Font: IBM Plex Sans (body) + IBM Plex Mono (numbers/dates). Loaded from Google Fonts CDN.

Key CSS variables (defined in `css/style.css`):
```
--pih-red: #C8102E      --green: #1a7a4a       --blue: #1a5fa8
--yellow: #d4820a       --gray-50 … --gray-800  --white: #ffffff
--font  --mono  --shadow-sm  --shadow  --shadow-lg  --radius  --radius-lg
```

Key layout classes:
- `.page` — page content wrapper (`display:none` by default; `.page.active` → `display:block`). All three analytics pages use `<div id="analytics-content" class="page active" style="display:none;">` — the inline style hides it until `init()` runs.
- `.two-col` — two-column responsive grid (collapses to 1 col on mobile)
- `.card` — white card with shadow; `.card-title`, `.card-subtitle`, `.card-header-row`
- `.stat-grid` / `.stat-card` — summary stat cards at top of overview page
- `.date-bar` — sticky toolbar (`position:sticky; top:0`). Was previously `top:52px` which caused a gap when the nav scrolled away — fixed to `top:0`.
- `.nav` — top nav bar (`position:sticky; top:0; height:52px`). Injected into `#nav-container` via JS. Note: `.nav` is sticky within `#nav-container` which is only as tall as the nav itself, so in practice the nav scrolls away on long pages.
- `.data-table` — styled table used for outcomes and site performance
- `.dq-grid-inner` / `.dq-card` — data quality grid cards
- `.no-data-banner` — full-page empty state shown when sessionStorage has no data

## Key conventions

- No framework — plain DOM manipulation, `innerHTML` injection.
- All chart rendering produces HTML strings injected via `innerHTML`.
- Nav is injected via `document.getElementById('nav-container').innerHTML = buildNav('<activeId>')` in each page's inline `<script>` at the bottom.
- Each analytics page's `<script>` block is minimal (just `buildNav`); all logic lives in `analytics.js`.
- `exampleExcelData/` contains real-format sample `.xlsx` files for testing the parser.
- `.claude/` is in `.gitignore` — do not commit it.

