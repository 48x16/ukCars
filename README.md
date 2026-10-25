# Rev Counter

Britain's cars, by the numbers. A static PWA built from official statistics: every make
and model licensed in the UK since 2014, electric cars and chargers, petrol and diesel,
a year of MOT results, illustrated feature stories, and tools you can use yourself. No
backend: build pipelines turn the source files into small JSON files, and the site is
static files on GitHub Pages.

## Run it

```sh
npm install
npm run data          # DfT licensing data, Insights, features, MOT join (about 1 minute)
npm run electric      # plug-in cars and public chargers by council
npm run fuel-prices   # DESNZ weekly pump prices
npm run postcodes     # one small file per postcode district, for the tools
npm run chargers      # Open Charge Map snapshot (needs OCM_API_KEY, see below)
npm run registrations # new cars since 2001: the stories built on them, and each make year by year
npm run traffic       # DfT road traffic since 1993
npm run driving-tests # DVSA driving tests: pass rates and waits by test centre
npm run travel-survey # the National Travel Survey: household cars, licences, mileage
npm run offences      # drink-drive collisions and motoring offences (after traffic)
npm run dev           # http://localhost:5173
npm test
```

Run them in that order: `npm run data` clears `public/data/` first. Each takes
`--cached` to reuse the downloads in `.cache/`, and `npm run data:cached` runs the lot
that way, in order. `npm run data:fixture` builds everything from tiny test files instead,
as CI does.

The yearly MOT summary is separate, because DVSA's file is about 5 GB:

```sh
npm run mot -- --year 2025         # streams the zip, writes data/mot/2025.json (commit it)
npm run mot-faults -- --year 2025  # failure reasons (another 4.4 GB), writes data/mot/2025-faults.json (commit it)
npm run offences-annual          # Home Office breath tests and offences, MoJ courts: writes data/offences/annual.json (commit it)
npm run geo                  # rebuilds the committed map files in data/geo/
```

End-to-end and accessibility tests (WCAG 2.2 AA with axe) run against the production build,
using Edge locally:

```sh
npm run build
npm run test:e2e
```

### Keys

The charger finder needs a free [Open Charge Map](https://openchargemap.org) API key, as
`OCM_API_KEY`: in a `.env` file locally (git-ignored, loaded by `npm run chargers`) and as
a repository secret for the workflow.

## Pipelines

| Workflow | When | What |
| --- | --- | --- |
| `CI` | Every pull request and push to `main` | Audit, unit tests, build on fixture data, end-to-end and axe tests |
| `Data and deploy` | Weekly, on push to `main`, or by hand | Fetch and validate every source, build, deploy to GitHub Pages |
| `MOT data` | 1 July, or by hand | Summarise a year of DVSA MOT results, uploaded as an artifact to commit |
| `CodeQL` | Pull requests, `main`, weekly | Static security analysis |

Dependabot opens grouped update pull requests weekly. See [docs/devops-notes.md](docs/devops-notes.md)
for how this maps to Azure DevOps, and the one-time GitHub setup.

## Pages

| Page | What |
| --- | --- |
| `index.html` | The front door: the headline number, search, a door to each section, tools and features |
| `explore.html` | Any make, model and version, charted by fuel and SORN since 2014 |
| `insights.html` | The national picture, from the dying and growing to the nearly extinct |
| `electric.html` | Electric cars in full, and plug-ins and public chargers mapped by council |
| `petrol-diesel.html` | The rise and fall of diesel, favourites, pump prices since 2003, the MOT by fuel |
| `mot.html` | A year of MOT tests: pass rates by age, paint, a postcode-area map, models |
| `features.html` and four stories | Out to play, The Bavarian battle, Where cars come from, Silver to grey |
| `tools.html` | Chargers near you, Quiet times for an MOT, Your car |

Every sentence that states a figure is generated from the data, so it stays true after
each update.

## How it fits together

| Path | What it does |
| --- | --- |
| `pipeline/run.js` | DfT licensing: fetch → validate → slice → `public/data/`, then Insights, features, the MOT join and the home page figures |
| `pipeline/categories.js` | Every editorial choice: hand-picked lists, thresholds, make origins, motorbikes to leave out |
| `pipeline/mot.js`, `mot-join.js` | Stream a year of MOT results into a summary; match DVSA's models to DVLA's |
| `pipeline/electric.js`, `chargers.js`, `fuel-prices.js`, `postcodes.js`, `geo.js` | One source each |
| `src/chart.js` | d3 line chart with crosshair tooltip and keyboard access |
| `src/council-map.js`, `area-map.js`, `paint-chart.js`, `feature-charts.js` | Maps and infographics |
| `src/styles/main.scss` | GOV.UK Frontend components under the house style |

## Design

Built on [GOV.UK Frontend](https://github.com/alphagov/govuk-frontend) for its accessible
components. This is not a government service, so it does not use the GOV.UK brand (the
crown, the GOV.UK header or the GDS Transport typeface). The house style is a car
magazine: white, all-sans (Inter Tight, Inter, IBM Plex Mono), black and grey with
GOV.UK's magenta (`#ca357c`, 4.87:1 on white) as the one accent, errors included. The
yellow focus state is kept for keyboard users.

No chart relies on colour alone: series differ by dash pattern, shape or label as well,
and every chart has a table or a list with the same figures. The one place colour is the
data, car paint, names every colour in text too.

## Data sources and licences

- Department for Transport and DVLA, [vehicle licensing statistics](https://www.gov.uk/government/statistical-data-sets/vehicle-licensing-statistics-data-files) (VEH0120, VEH0145) and [EV charging statistics](https://www.gov.uk/government/statistical-data-sets/electric-vehicle-charging-infrastructure-statistics-data-tables-evci) (EVCI0102)
- Driver and Vehicle Standards Agency, [anonymised MOT tests and results](https://www.data.gov.uk/dataset/c63fca52-ae4c-4b75-bab5-8b4735e1a4c9/anonymised-mot-tests-and-results), and [driving test data: cars](https://www.gov.uk/government/statistical-data-sets/driving-test-and-theory-test-data-cars)
- Department for Transport, [National Travel Survey](https://www.gov.uk/government/collections/national-travel-survey-statistics) (England)
- Department for Transport, [road safety statistics](https://www.gov.uk/government/statistical-data-sets/road-safety-statistics-data-tables) (drink-drive collisions and breath tests); Home Office, [police powers and procedures: roads policing](https://www.gov.uk/government/statistics/police-powers-and-procedures-roads-policing-to-december-2024); Ministry of Justice, [criminal justice statistics](https://www.gov.uk/government/collections/criminal-justice-statistics)
&, [weekly road fuel prices](https://www.gov.uk/government/statistics/weekly-road-fuel-prices)
- Office for National Statistics, postcode lookup and boundaries; OS Code-Point Open
- [Open Charge Map](https://openchargemap.org), openly licensed providers only, each credited on the page

Contains public sector information licensed under the
[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
© Crown copyright. Contains OS data © Crown copyright and database right; Royal Mail data
© Royal Mail copyright and database right; National Statistics data © Crown copyright and
database right.

This project is not affiliated with or endorsed by DfT, DVLA, DVSA, DESNZ, ONS or any car maker.
