# Rev Counter (ukcars)

Britain's cars, by the numbers: a static PWA on GitHub Pages (https://roads.richyork.co.uk),
built from official open data. Node pipelines turn source files into small JSON files; Vite
builds the pages; d3 draws the charts. No backend.

New to the code? Run the `codebase-onboarding` skill. Adding things? Use `add-data-source`,
`add-feature-page` and `check-page`.

## Commands

```sh
npm run data:cached     # rebuild all of public/data/ from .cache/ (offline, about 3 minutes)
npm run data:fixture    # rebuild from tiny test files, as CI does
npm run dev             # http://localhost:5173
npm test                # vitest unit tests
npm run build && npm run test:e2e   # Playwright + axe (WCAG 2.2 AA), uses Edge locally
```

## Rules that bite

- `pipeline/run.js` **wipes `public/data/`**. Every other pipeline (electric, postcodes,
  chargers, fuel-prices, registrations, traffic) must run after it. `data:cached` and
  `data:fixture` already chain them in order: add any new pipeline to both, and to
  `.github/workflows/data-and-deploy.yml`.
- `public/data/` is git-ignored and built fresh. Some summaries are committed instead, built by
  hand and read by the weekly build: the yearly MOT summaries in `data/mot/` and the maps in
  `data/geo/` (their sources are gigabytes), and `data/offences/annual.json` (Home Office and
  MoJ files that are renamed with every edition: `npm run offences-annual`).
- Before running `data:fixture` locally, back up `public/data/` and restore it afterwards.
- After thousands of data files change, the Vite dev server hangs: restart it.
- No Python on this machine; Playwright uses `channel: 'msedge'`; axe needs `browser.newContext()`.

## Content rules

- **Every sentence that states a figure is generated from the data**, so it stays true after
  each update. Never hard-code a number in prose.
- Judge thresholds against low-volume makes (Lamborghini): prefer rules relative to each
  model's own peak (`onSaleBar` in `src/series.js`) over fixed cut-offs.
- Cars only. No collision fatalities or casualty counts (drink-driving and offence data is fine).
- Open Government Licence (or equally open) data only. Check the licence before building.
  Not allowed: BVRLA figures, Fuel Finder per-station prices.
- House style: light only, white, sans (Inter Tight, Inter, IBM Plex Mono), black and grey,
  GOV.UK magenta `#ca357c` as the one sparing accent. Never propose dark mode.
- No chart relies on colour alone; every chart has a table or list twin.

## Done means

Unit tests pass. The page renders on real data **and** on fixture data (empty lists must not
crash: use `emptyNote`). axe is clean, and there is no sideways scroll at 360px. The e2e spec
covers the page. Work on a branch and merge through a pull request: a hook blocks pushes to
main.
