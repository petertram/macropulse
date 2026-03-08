# Codex Suggestion: House-View Model Overhaul Plan

## Summary
The current repo is useful as a macro demo terminal, but it is not yet structured like a top macro-firm house-view system. The main gaps are visible in `server/index.ts`, `frontend/src/features/documentation/Methodology.tsx`, and `frontend/src/features/monitors/flight2safety/constants.ts`: model logic is mostly hard-threshold heuristics, scorecards are partly frontend-defined, docs overstate methodology, and outputs are not organized around committee-grade house-view formation.

Target end-state: a full global macro, house-view-desk-first platform that produces explicit cross-asset views by region, with direction, conviction, horizon, catalysts, and implementation implications.

## Key Changes

### 1. Replace ad hoc scorecards with a server-side house-view engine
- Introduce a canonical signal schema and compute all scores server-side.
- New core types:
  - `SignalState`: `id`, `pillar`, `region`, `assetClass`, `horizon`, `direction` (`-2` to `+2`), `conviction` (`0-100`), `momentum`, `surprise`, `asOf`, `stale`, `drivers[]`, `version`
  - `HouseViewSummary`: `baseCase`, `bullCase`, `bearCase`, `probabilities`, `topChanges`, `keyRisks`, `crossAssetCalls[]`
  - `ScorecardRow`: `view`, `conviction`, `timeframe`, `supportingSignals[]`, `catalysts[]`, `invalidation`
- Move score definitions out of frontend constants into versioned server config so one methodology drives API, UI, backtests, and docs.

### 2. Rebuild the model stack around house-view pillars
- Define five primary pillars by region: `growth`, `inflation`, `policy`, `liquidity/funding`, `risk sentiment`.
- Coverage for v1: `US`, `Eurozone`, `UK`, `Japan`, `China`, plus a `Global` aggregate rollup.
- Replace current simplistic models with these decision rules:
  - `Macro regime`: use a multi-signal probabilistic regime classifier, not CFNAI+CPI thresholding. Inputs should include activity, labor, core inflation, wages, financial conditions, and market pricing.
  - `Cross-asset risk`: replace “Flight to Safety” with a risk-transfer scorecard built from credit stress, funding stress, vol term structure, equity breadth, stock-bond correlation regime, and real-rate shock.
  - `Rates/bonds`: split into `duration`, `curve`, `breakevens`, `real yields`, `carry/roll`, `policy pricing`, and `supply/term premium`; output separate views for front-end rates, belly, long-end, breakevens, and linkers.
  - `Equities/factors/sectors`: downgrade them from top-level house-view drivers to downstream implementation sleeves. Tie them to regime, earnings revisions, liquidity, and real-rate sensitivity rather than pure 12M momentum and trailing PE.
  - `Recession`: keep as one risk sleeve, not the centerpiece. Expand from Sahm + curve into a broader slowdown probability input to the growth pillar.
  - `Scenario analysis`: re-anchor scenarios to the same signal graph and output committee-style `base/bull/bear` cases instead of separate illustrative heuristics.

### 3. Expand the data model to fit full global macro use
- Keep current FRED/Yahoo inputs as bootstrap sources, but add a vendor-adapter layer so the engine can ingest global rates, FX, PMIs, inflation expectations, OIS, CDS/credit, earnings revisions, commodity curves, and positioning.
- Add metadata on every series: `region`, `releaseLag`, `frequency`, `importance`, `transform`, `fallbackRule`.
- Normalize all inputs into three comparable forms:
  - level percentile vs history
  - short-term momentum/change
  - surprise vs expectation or recent trend
- Add explicit stale-data handling so every signal can degrade gracefully instead of using silent frontend proxies.

### 4. Redesign scorecards for committee workflow
- Replace raw “score out of 100” cards with house-view tables that answer:
  - What is the view?
  - How strong is conviction?
  - What changed since last review?
  - What validates or invalidates the call?
  - What are the best implementations?
- New top-level scorecards:
  - `Global House View`
  - `Regional Growth/Inflation Matrix`
  - `Rates & Duration`
  - `FX`
  - `Equities`
  - `Credit`
  - `Commodities`
  - `Liquidity & Stress`
- Each row should include direction, conviction, 1M/3M/12M horizon, change since prior snapshot, top 3 drivers, catalysts, and a suggested implementation basket.
- Remove methodology drift: if probabilistic/HMM methods are not implemented yet, docs must stop claiming them.

### 5. Refactor the frontend around synthesis, not isolated widgets
- Replace the current model list UX with a house-view landing page:
  - current base case
  - regional regime map
  - cross-asset recommendation matrix
  - biggest changes since last update
  - scenario distribution
- Keep detailed drill-down pages, but each must roll up to the house view rather than stand alone.
- Add an investment-committee view with:
  - previous vs current view diff
  - evidence summary by pillar
  - regime history
  - scenario tree
  - implementation notes
- AI commentary should consume structured outputs from the engine, not raw dashboard vitals.

### 6. API surface to add
- `GET /api/house-view/summary`
- `GET /api/house-view/signals`
- `GET /api/house-view/scorecards/:sleeve`
- `GET /api/house-view/scenarios`
- `GET /api/house-view/history`
- `GET /api/house-view/changes`
- Existing model endpoints can remain temporarily as legacy drill-downs, but new UI should read from the house-view APIs first.

### 7. Recommended implementation order
1. Build canonical signal schema, scoring semantics, and server-side config/versioning.
2. Implement pillar engines for US and Global first, then extend to Eurozone, UK, Japan, and China.
3. Replace macro regime, flight-to-safety, and bond scorecard logic with the new engine outputs.
4. Recast equities/sectors/factors as implementation layers downstream of the house view.
5. Ship the new house-view landing page and committee workflow.
6. Align methodology docs and remove unsupported claims.
7. Add historical tracking, view-diffing, and backtest diagnostics.

## Test Plan
- Contract tests for every new house-view API shape and version field.
- Deterministic unit tests for transforms: percentile rank, z-score, momentum, surprise, stale-data degradation, conviction mapping.
- Regression tests on regime classification and rates/FX/equity sleeve outputs using frozen historical snapshots.
- Historical replay tests that verify:
  - views only use data available at that timestamp
  - conviction falls when coverage is missing or stale
  - score changes are explainable from changed drivers
- Acceptance scenarios:
  - inflation shock with sticky growth
  - growth scare with easing policy
  - positive stock-bond correlation regime
  - liquidity/funding stress spike
  - divergent regional regimes, especially US vs Europe vs China

## Assumptions
- Primary user is the house-view desk, not a PM execution console.
- Scope is full global macro, but v1 should still stage by region instead of attempting full EM breadth immediately.
- Research-process quality is prioritized over quick UI polish.
- Sector and factor outputs remain in the product, but only as downstream implementation sleeves.
- Documentation must match implemented methods exactly until more advanced models are actually shipped.
