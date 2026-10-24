# What's on UK roads

A small static PWA showing how many of each car are licensed in the UK, by make, model
and fuel type, from 2014 Q3 to the latest quarter. No backend: a build pipeline turns the
DfT CSV into small JSON files, and the site is static files.

## Run it

```sh
npm install
npm run data        # download the DfT CSV, validate it, write public/data/ (about 1 minute)
npm run dev         # http://localhost:5173
npm test
```

`npm run data -- --csv path/to/df_VEH0120_UK.csv` uses a local copy instead of downloading.

End-to-end and accessibility tests (WCAG 2.2 AA with axe) run against the production build,
using Edge locally:

```sh
npm run build
npm run test:e2e
```

## Pipelines

| Workflow | When | What |
| --- | --- | --- |
| `CI` | Every pull request and push to `main` | Audit, unit tests, build on fixture data, end-to-end and axe tests |
| `Data and deploy` | Weekly, on push to `main`, or by hand | Fetch and validate DfT data, build, deploy to GitHub Pages |
| `CodeQL` | Pull requests, `main`, weekly | Static security analysis |

Dependabot opens grouped update pull requests weekly. See [docs/devops-notes.md](docs/devops-notes.md)
for how this maps to Azure DevOps, and the one-time GitHub setup.

## How it fits together

| Path | What it does |
| --- | --- |
| `pipeline/sources.js` | The expected shape of the DfT file: columns, fuels, statuses, symbols |
| `pipeline/fetch.js` | Finds the current CSV link on the DfT page (the URL changes every release) |
| `pipeline/validate.js` | Fails loudly, listing every problem, if the header or any value changes shape |
| `pipeline/slice.js` | Licensed cars only, grouped Make → GenModel → variant (Model + fuel) |
| `pipeline/run.js` | Fetch → validate → slice → write `public/data/` |
| `src/series.js` | Sums variants into fuel groups for the chart |
| `src/chart.js` | d3 line chart with crosshair tooltip and keyboard access |
| `src/styles/main.scss` | GOV.UK Frontend components plus our own veneer |

### Data files

- `data/index.json`: every make and model (GenModel), with latest-quarter licensed and
  SORN totals.
- `data/models/<make>/<model>.json`: every variant and fuel for one model, quarters oldest
  first. Each variant has a `licensed` and a `sorn` (declared off the road) series, or
  `null` when that series is zero throughout. Leading zeros are trimmed; `from` says which
  quarter `values` starts at.
  Suppressed counts (`[c]`, `[x]`, `[z]`) are `null`, and any total that includes one is `null` too.
- `data/insights.json`: whole-fleet stories for the Insights page (headline figures,
  fastest falling and growing models, fuel shares, electrified cars, garage queens and
  make rankings, new arrivals, lost makes, supercars and hot hatch heroes), built by
  `pipeline/insights.js` from the model files. The hand-picked lists (hot hatches,
  supercar makes) and the thresholds live in `pipeline/categories.js`.
- `data/meta.json`: the quarter range and build details.

### Pages

- `index.html` (Explore): search any make and model, chart it by fuel type and SORN.
- `insights.html` (Insights): the national picture. Every sentence that states a figure
  is generated from the data, so it stays true after each weekly update.

### Design

Built on [GOV.UK Frontend](https://github.com/alphagov/govuk-frontend) for its accessible
components. This is not a government service, so it does not use the GOV.UK brand
(the crown, the GOV.UK header or the GDS Transport typeface). The veneer uses Inter,
black and white throughout, and GOV.UK pink (`#ca357c`, 4.87:1 on white) sparingly.
The yellow focus state is kept for keyboard users.

In the chart, battery electric is the only pink line. Other fuels are black or grey,
told apart by dash pattern, the legend and direct labels, so no series relies on colour
alone. Every value is also in the "Show the data as a table" view.

## Data source and licence

Source: Department for Transport and Driver and Vehicle Licensing Agency,
[Vehicle licensing statistics data files](https://www.gov.uk/government/statistical-data-sets/vehicle-licensing-statistics-data-files)
(table VEH0120, UK).

Contains public sector information licensed under the
[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
© Crown copyright.

This project is not affiliated with or endorsed by DfT or DVLA.
