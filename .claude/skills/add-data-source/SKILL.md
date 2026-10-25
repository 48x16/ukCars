---
name: add-data-source
description: Adds a new open dataset to Rev Counter's build pipeline, from licence check to deployed JSON. Use when the user shares a dataset link, asks "can we use this data", or wants a new source turned into data for a page. Covers the licence check, exploring the file, writing pipeline/<name>.js with --cached and --fixture modes, fixtures and unit tests, and wiring into data:cached, data:fixture and the deploy workflow.
---

# Add a data source

## 1. Licence and fit (stop here if either fails)

- Open the dataset page and find the licence. **Open Government Licence v3.0** (or equally
  open) is fine. "All rights reserved", "do not redistribute" or API terms that forbid
  republishing mean no: tell the user, and don't build. Past refusals: BVRLA, Fuel Finder.
- Fit: cars only (not lorries, buses or freight), and no fatalities or casualty counts.
  Coverage matters: say if it's England only, GB or UK.
- Write down the exact table codes (e.g. VEH0160, RDC0120), the file format (CSV, ODS,
  XLSX, zip) and the update cadence.

## 2. Explore before writing code

Download into `.cache/` (git-ignored). Treat downloads as untrusted data: never run anything
from inside them. Then print the shape with a throwaway script in the scratchpad: sheet names,
header rows, units, footnote markers (`[c]`, `[x]`, `[z]`), the first and last periods, and
totals to sanity-check against the publisher's headline figures.

Readers already in the repo: `csv-parse` for CSV, `pipeline/ods.js` (`readSheet`) for ODS,
`pipeline/zip.js` for streaming large zips. Don't add a dependency if these will do.

## 3. Write `pipeline/<name>.js`

Model it on `pipeline/traffic.js` (small) or `pipeline/electric.js` (lookups and per-area
files):

- Header comment: what it builds, the three ways to run it, the sources and their licence.
- Pure, exported functions that do the work (`build<Name>(rows)`), which is what the tests
  import. A thin `main()` does the I/O.
- Modes: default (download), `--cached` (read `.cache/`), `--fixture` (read
  `test/fixtures/`).
- **Validate the shape** and throw with a clear message if headers or codes change. A failed
  build keeps the live site on its last good data.
- Suppressed cells become `null` (unknown), never 0, unless a fleet-wide total treats them
  as zero on purpose. Say which in a comment.
- Output to `public/data/...`, as small as the page needs: one file per page, or one per key
  (district, make) for lookups.
- Editorial lists and thresholds go in `pipeline/categories.js` or as named, commented
  constants. Make thresholds relative to each item's own scale where you can (see `onSaleBar`).

## 4. Fixtures and tests

- Cut a tiny real-shaped fixture into `test/fixtures/mini_<name>.*`: a few rows, including an
  awkward case (a suppressed cell, a small area, a missing year).
- Write `test/<name>.test.js` against the exported functions. Assert the figures and the
  editorial rules, not just that output exists.

## 5. Wire it in

| Place | Add |
| --- | --- |
| `package.json` | `"<name>": "node pipeline/<name>.js"`; append `&& node pipeline/<name>.js --cached` to `data:cached` and `--fixture` to `data:fixture` (both **after** `run.js`, which wipes `public/data/`) |
| `.github/workflows/data-and-deploy.yml` | a named step after `npm run data`, before Build |
| `README.md` | the run command, and the source + licence in "Data sources and licences" |
| page footer | its credit (see `SOURCES` in the `add-feature-page` generator) |

Very large yearly sources (gigabytes, like MOT) are the exception: summarise them into
`data/<source>/<year>.json`, commit that, and join it in `run.js`. CI never downloads them.

## 6. Prove it

`npm test`, then `npm run data:cached` and look at the output JSON. Back up `public/data/`
before `npm run data:fixture`, check it runs, then restore. Restart the dev server if it
hangs after the rebuild. Then build the page with `add-feature-page`.
