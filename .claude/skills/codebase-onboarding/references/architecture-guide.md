# Architecture guide

## The pattern

A **static site with a build-time ETL pipeline**, shipped as a **multi-page PWA**.

```
 official sources            build time (Node)                 static site (browser)
 ───────────────            ─────────────────                 ─────────────────────
 DfT CSV / ODS     ─┐
 DVSA MOT zips     ─┤  fetch → validate → summarise    ┌─► 28 HTML pages (Vite)
 ONS lookups       ─┼─► pipeline/*.js ───────────────► │   one src/<page>.js each
 DESNZ, OCM, ...   ─┘        │                         │   fetch JSON → draw with d3/DOM
                             ▼                         │
                    public/data/**.json  ──────────────┘   service worker caches shell + data
```

There is no server at run time. All the heavy lifting (gigabytes of MOT data, millions of
licensing rows) happens once, at build time. The browser only fetches small, ready-shaped
JSON files, usually one per page plus one per model or postcode district looked up.

Why: hosting is free (GitHub Pages) and there's nothing to keep running. Pages are fast and
work offline. Every published figure can be traced back to one pipeline function and tested.

## Directory map

| Path | What lives there |
| --- | --- |
| `pipeline/` | Node ES modules, one per source or story. Entry points have an `npm run` script; the rest are libraries. |
| `pipeline/run.js` | The main pipeline: DfT VEH0120 licensing → per-model files, index, Insights, features, the MOT join, home figures. **Clears `public/data/` first.** |
| `pipeline/categories.js` | Every editorial choice in one place: hand lists (hot hatches, body styles, origins), thresholds. |
| `pipeline/sources.js`, `validate.js` | The expected shape of the main source; validation fails the deploy rather than publishing bad data. |
| `pipeline/fetch.js`, `zip.js`, `ods.js` | Downloading, streaming zip64 entries, reading ODS sheets: no heavy dependencies. |
| `data/mot/` | Committed yearly MOT summaries (`<year>.json`, `<year>-faults.json`): their sources are 4 to 5 GB each. |
| `data/geo/` | Committed map shapes in British National Grid metres (rebuilt by hand with `npm run geo`). |
| `public/data/` | **Generated, git-ignored.** What the site fetches. |
| `*.html` (root) | One file per page. Vite inputs are listed in `vite.config.js`. |
| `src/<page>.js` | The script for each page (e.g. `feature-faults.js`, `trumps.js`, `main.js` for Explore). |
| `src/shell.js` | Shared by every page: fonts, styles, nav menu, offline badge, service worker registration. |
| `src/feature-page.js` | Start-up for feature pages: load `features/<name>.json`, fill dates, icons, errors. |
| `src/chart.js`, `council-map.js`, `area-map.js`, `feature-charts.js`, `insight-charts.js`, `make-story.js` | Reusable charts and maps. |
| `src/*-calc.js` | Pure logic split out of tool pages so it can be unit-tested. |
| `src/sw.js` | Service worker source; `vite.config.js` fills in the precache list at build. |
| `src/styles/main.scss` | GOV.UK Frontend under the house style; all `wuk-` classes. |
| `test/` | Vitest unit tests for pipelines and calc modules; `test/fixtures/` holds tiny source files. |
| `e2e/` | Playwright specs: every page renders, every section appears, axe finds no WCAG 2.2 AA violations, on desktop and phone. |
| `.github/workflows/` | `ci.yml` (PR gate), `data-and-deploy.yml` (weekly build and deploy), `mot-data.yml` (yearly), `codeql.yml`. |
| `design/` | Early design direction explorations (not part of the build). |
| `docs/devops-notes.md` | How this maps to Azure DevOps; one-time GitHub setup. |

## Page families

| Family | Pages | Data |
| --- | --- | --- |
| Front door | `index.html` | `home.json` |
| Sections | `explore`, `insights`, `electric`, `petrol-diesel`, `mot` | `index.json` + `models/<make>/<model>.json`, `insights.json`, `electric.json`, `fuel-prices.json`, `mot.json` |
| Features (magazine stories) | `features.html` + 15 stories (`mini`, `suv`, `faults`, `traffic`, ...) | `features/<name>.json`, one per story |
| Tools | `tools.html`, `your-car`, `mot-times`, `chargers`, `make`, `trumps`, `plugins` | per-key files: `postcodes/<district>.json`, `registrations/<make>.json`, `plugins/<district>.json`, `chargers/<square>.json` |

## Data flow, end to end (one example)

"Why cars fail", from DVSA's zip to the reader:

1. `npm run mot-faults -- --year 2025` (`pipeline/mot-faults.js`) streams the 4.8 GB results
   zip to find each failed initial test, then the 4.4 GB items zip, joined by test id. It
   writes `data/mot/2025-faults.json` (1.5 MB, committed).
2. The weekly `npm run data` (`pipeline/run.js`) joins that summary to DVLA's models with
   `buildFaults` (`pipeline/faults.js`) and writes `public/data/features/faults.json`.
3. Vite builds `faults.html`, which loads `src/feature-faults.js`.
4. In the browser, `startFeature('faults', render)` fetches the JSON. `render` draws bars, a
   heat table and a model picker, and writes every summary sentence from the numbers.
5. The service worker caches the page shell on install and the JSON when first viewed, so
   the page works offline afterwards.

## Cross-cutting decisions

- **Plain DOM + d3, no framework.** Each page is small and independent; text is always set
  with `textContent` (source names are untrusted).
- **GOV.UK Frontend for accessible components**, restyled (not the GOV.UK brand).
- **Every chart has a twin**: a table, or a list with the figures written in.
- **Fail before you deploy**: sources are validated in the build job; the deploy job only runs
  if it passed, so the live site keeps its last good data.
- **PR checks never touch the network**: CI builds from `test/fixtures/`.
