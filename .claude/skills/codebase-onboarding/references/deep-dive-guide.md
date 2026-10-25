# Deep-dive guide

One section per subsystem. Each says what it does, where the code is, how it works, and
the traps. Read the module's header comment for the latest detail.

---

## 1. The data pipelines and their run order

**Where:** `pipeline/`, `package.json` scripts, `.github/workflows/data-and-deploy.yml`.

| Script | Source (licence) | Writes |
| --- | --- | --- |
| `npm run data` (`run.js`) | DfT VEH0120, licensed + SORN cars by model, UK, quarterly since 2014 (OGL) | `index.json`, `models/**`, `insights.json`, `features/*.json`, `mot.json`, `home.json`, `meta.json` |
| `npm run electric` | DfT VEH0145 (plug-ins by small area), EVCI0102 (chargers), ONS lookup | `electric.json`, `plugins/<district>.json` |
| `npm run postcodes` | OS Code-Point Open | `postcodes/<district>.json` |
| `npm run chargers` | Open Charge Map (open-licence providers only; needs `OCM_API_KEY`) | `chargers/<square>.json` |
| `npm run fuel-prices` | DESNZ weekly pump prices | `fuel-prices.json` |
| `npm run registrations` | DfT VEH0160 GB, first registrations since 2001 | `features/{suv,diesel,plates,arrivals,mini}.json`, `registrations/<make>.json` |
| `npm run traffic` | DfT road traffic statistics | `features/traffic.json` |
| `npm run mot`, `mot-faults` | DVSA anonymised MOT results and items (yearly, 4 to 5 GB each) | `data/mot/<year>.json`, `<year>-faults.json` (**committed**) |
| `npm run geo` | ONS boundaries, Code-Point | `data/geo/*.json` (**committed**) |

**Run order:** `run.js` deletes `public/data/` before writing, so it goes first and
everything else follows. Every pipeline takes `--cached` (use `.cache/`) and `--fixture`
(use `test/fixtures/`). `data:cached` and `data:fixture` chain them all.

**Trap:** add a new pipeline to all three chains: `data:cached`, `data:fixture` and the
workflow. If you miss one, the data is missing from that build.

## 2. The licensing slice (VEH0120 → per-model files)

**Where:** `run.js`, `sources.js`, `validate.js`, `slice.js`.

- `processCsv` streams the CSV. It validates the header against `FIXED_COLUMNS` and the
  quarter columns, and each row's codes (`LICENCE_STATUSES`, `KNOWN_FUELS`: a new fuel is a
  warning, not a failure).
- `createAggregator` groups cars by Make → GenModel → variant (Model + Fuel). Each variant has
  a licensed series and a SORN series, oldest first.
- Suppressed cells (`[c]`, 1 to 4 vehicles) become `null`, meaning unknown, not zero.
  `addCounts` keeps unknown + anything as unknown. Fleet-wide stories (`insights.js`,
  `features.js`) count null as zero, because at that scale it's below anyone's precision.
- `PREVIOUS_META_URL` (set in CI) stops an older DfT publication from replacing newer data.

## 3. MOT results and the DVSA → DVLA join

**Where:** `pipeline/mot.js`, `mot-join.js`, `zip.js`.

- `mot.js` streams each monthly CSV from the zip without unpacking it (`zip.js` reads zip64).
  It counts **class 4 (cars), normal tests (`NT`), not retests**, so each car counts about
  once a year. Results are P, F or PRS (passed after a repair at the test); abandoned tests
  are left out.
- Age is test year minus first-use year (`ageInYears`), so every first MOT is "3 years".
- Busy times are the exception: they count retests too, because a retest takes a slot.
- `spotlight`: every make with at least 5,000 tests gets areas, engine-size bands and colours
  by year, which feeds the make pages.
- `mot-join.js` matches DVSA's free-text models to DVLA's (`"MERCEDES-BENZ C220 D"` →
  `MERCEDES C CLASS`). It drops words from the end and applies CLASS and SERIES patterns; the
  longest match wins. **Unmatched names are reported, never guessed.**
- DVSA's data has no test-centre IDs, only postcode area.

## 4. MOT failure items ("Why cars fail")

**Where:** `pipeline/mot-faults.js`, `faults.js`, `src/feature-faults.js`.

- The items file holds only a test id. Pass 1 (results) keeps each failed initial test's id
  in a sorted `Uint32Array`, with its age band, fuel and model. Pass 2 (items) binary-searches
  each item's test id and sets a 32-bit "section failed" mask per test, so each test counts
  once per part.
- `faultLookup` merges the old (pre-2018) and current section trees by name, and
  `mergeDefects` merges reasons with identical wording. Defect counts are **items**, not
  tests: the page says "per 100 MOTs".
- `buildFaults` keeps sections with at least 0.1% of tests (`MIN_SECTION_SHARE`), and models
  with at least 5,000 tests that are cars in `mot.models`. It gives sections everyday names
  (`SHORT`).
- The page compares models **at the same age** (10 to 14 years where there are enough
  tests), because comparing across ages mostly measures age.

## 5. Registrations and make stories

**Where:** `pipeline/registrations.js`, `mini.js`, `categories.js`, `src/make-story.js`.

- VEH0160 GB goes back to 2001; it's the honest stand-in for "cars sold". One pass feeds the
  SUV, diesel, plates, arrivals and Mini stories, plus `registrations/<make>.json` for every
  make (about 87).
- Body styles aren't in DfT data: they're hand-classified in `categories.js`
  (`BODY_BY_MODEL`, `BODY_BY_MAKE`, `BODY_RULES`, `bodyOf`).
- `MERCEDES-BENZ` is merged into `MERCEDES`.
- "On sale" and "farewell" use `onSaleBar` (`src/series.js`): a model counts as on sale above
  20% of its own peak, clamped to 10 to 100 a year. A fixed bar fired false farewells for
  low-volume makes like Lamborghini.
- `renderMakeStory` (`src/make-story.js`) draws the Mini page and every make on `make.html`.

## 6. Anatomy of a feature page

**Where:** `<name>.html`, `src/feature-<name>.js`, `pipeline/features.js` (or the story's own
pipeline), plus its wiring.

```
<name>.html          hero (kicker, h1, credits, standfirst, #hero-graphic)
                     + <section class="wuk-section wuk-split"> per section
                       side: h2 + generated summary <p id="...-summary"> + method note
                       main: chart container(s), "Show the data as a table" <details>
                     + footer with the source credit
src/feature-x.js     startFeature('x', (data) => { fill(...); draw...; summary sentences })
public/data/features/x.json   written by the pipeline
```

Wiring for a new page: `vite.config.js` (`input` and the precache `pages` list),
`src/shell.js` (the nav section's `pages`), `features.html` or `tools.html` (a card),
the count on `index.html` ("All N features"), and an entry in `e2e/features.spec.js`
or `tools.spec.js`. The `add-feature-page` skill scripts all of this.

Helpers: `$`, `fill`, `startFeature` (`feature-page.js`); `el`, `emptyNote`
(`insight-charts.js`); `bars` (`make-story.js`); `displayName`, `icon` (`feature-charts.js`).

## 7. Charts and maps

- `chart.js`: d3 line chart (fuel groups plus a pale SORN area), with a crosshair tooltip and
  keyboard access. Line identity comes from `.wuk-line--<group>` (dash patterns, not just
  colour) plus direct labels.
- `council-map.js` and `area-map.js`: maps in British National Grid metres, so no
  projection, just a flipped y axis. Five greys from `quintileBreaks`/`stepOf`, London in an
  inset. Exact values are in the list or table twin.
- `feature-charts.js`, `make-story.js` `bars`: HTML-first infographics (lists and grids),
  so screen readers get real text.
- Heat tables (MOT busy times, faults by age) use `.wuk-heat__cell[data-step]`, the same five
  greys with contrast already handled.

## 8. Service worker and offline

**Where:** `src/sw.js`, `vite.config.js` (`serviceWorker()` plugin).

- On install it caches the app shell. The build fills in `__PRECACHE__` with every hashed
  asset and the page list; the version is a hash of that list, so a new build means a new
  cache.
- `index.json` and `meta.json` are network-first, so a new data release shows at once.
- Other data is stale-while-revalidate, so anything you've viewed works offline.
- **Trap:** a new page must be added to the precache `pages` list in `vite.config.js`.

## 9. Testing

- **Unit (`npm test`, Vitest):** pipeline functions on small inline data or
  `test/fixtures/`, plus `*-calc.js` logic. Assert the editorial rules (thresholds,
  low-volume makes), not just shapes.
- **End to end (`npm run test:e2e`, Playwright):** run against `npm run build` + `vite
  preview`. Each page: the h1, every section heading, a ready selector, and axe with WCAG 2.2
  AA tags, on desktop and on a Pixel 7. Locally Edge (`channel: 'msedge'`); CI installs
  Chromium.
- **Fixture data must not crash pages:** lists can be empty. Guard with `emptyNote`.
- A PostToolUse hook runs `vitest related` on every file Claude edits in `pipeline/` or `src/`.

## 10. CI/CD and deploy

| Workflow | Trigger | Does |
| --- | --- | --- |
| `ci.yml` | PRs, pushes to main | `npm audit --audit-level=high`, unit tests, build on fixtures, e2e + axe; uploads the Playwright report on failure |
| `data-and-deploy.yml` | weekly cron, push to main, by hand | unit tests, every pipeline live, build, then the deploy job (only if build passed) to GitHub Pages |
| `mot-data.yml` | 1 July, by hand | yearly MOT summary as an artifact to commit |
| `codeql.yml` | PRs, main, weekly | static security analysis |

Actions are pinned to commit hashes; `permissions` default to read-only. Branch ruleset on
main: PR required, `checks` and `analyze` must pass, no force pushes (mirrored locally by the
`guard-push` hook). Custom domain: roads.richyork.co.uk.

## 11. Editorial rules (the judgement layer)

- Every figure in prose is generated from the data; never type a number into a sentence.
- Relative thresholds beat fixed ones (see `onSaleBar`); test them on a low-volume make.
- Say what the data is, honestly: VEH0160 is "registered for the first time", not "sold";
  "company" keepers include fleets, rental and Motability.
- Licence first: OGL or equivalent only. Each source is credited in the page footer and in
  the README.
- Cars only; no fatalities or casualty counts; light theme only; magenta is a sparing accent.
