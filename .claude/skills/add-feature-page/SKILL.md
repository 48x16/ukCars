---
name: add-feature-page
description: Adds a new magazine-style feature story or tool page to Rev Counter, from data JSON to a wired-up, tested page. Use when asked to build a new feature, story, infographic page or tool, or to turn a dataset into a page. Covers the page spec, the generator script, the page script, all the wiring (Vite, nav, cards, service worker, e2e) and the checks.
---

# Add a feature page

A feature page is a story told in sections. Each section has a short generated summary and
a method note on the left, and a chart and table on the right. The data must already exist
as `public/data/features/<name>.json`; if not, run `add-data-source` first.

## 1. Plan the story from the data (before any code)

Print the JSON's key figures in the terminal (`node -e ...`) and decide:

- **Title** (2 to 4 words, magazine voice: "Why cars fail", "Peak diesel") and a one-line
  **standfirst**.
- **3 to 6 sections**, each answering one question, with an h2 that says it plainly.
- For each section, **the sentence the data supports**. Check it holds on the real numbers,
  and on a low-volume case (a small make, an empty list).
- What's honest to claim: name the measure exactly ("registered for the first time", "per 100
  MOTs, not counting retests").

## 2. Generate the page shell

Copy `scripts/example-spec.cjs` to the scratchpad, edit it (file, title, description, script,
sources, credits, standfirst, sections), then from the repo root:

```sh
node .claude/skills/add-feature-page/scripts/make-page.cjs <your-spec.cjs>
```

It builds the page from `bavarian.html`'s frame (head, nav, error box, footer). Tools: set
`section: 'tools'`, plus `resultsWrap: true` if the results stay hidden until a search. For a
new source, add its footer credit to `SOURCES` in `make-page.cjs` first. The generator refuses
to overwrite an existing page; edit those by hand.

## 3. Write `src/feature-<name>.js`

Follow `src/feature-faults.js`:

```js
import { $, fill, startFeature } from './feature-page.js';
import { el, emptyNote } from './insight-charts.js';
import { bars } from './make-story.js';

startFeature('<name>', (data) => {
  // hero tiles, then one block per section: chart + generated summary sentence
});
```

- Every sentence with a figure is built from `data`, with `Intl.NumberFormat('en-GB')`.
- Set text with `textContent` / `el()`, never `innerHTML` with data.
- Guard empty lists with `emptyNote()`: fixture data has almost nothing in it.
- Part names mid-sentence: lower-case only the first letter (keeps "VIN", "MOT").
- Reuse before you build: `bars`, `quintileBreaks`/`stepOf` + `.wuk-heat__cell` for heat
  tables, `council-map.js`, `area-map.js`, `chart.js`. Check `main.scss` before adding a class:
  class names can collide (`.wuk-heat` already belongs to the busy-times table).
- Every chart needs a twin: a table in "Show the data as a table", or a list with the figures.

## 4. Wire it in (all of these, or something breaks quietly)

| File | Change |
| --- | --- |
| `vite.config.js` | add to `build.rolldownOptions.input` **and** the service worker `pages` list |
| `src/shell.js` | add the page to the Features (or Tools) nav entry's `pages` |
| `features.html` / `tools.html` | add a `wuk-card` (icon, linked title, standfirst) |
| `index.html` | bump "All N features" to the new card count; update `e2e/home.spec.js` to match |
| `e2e/features.spec.js` / `tools.spec.js` | add `{ page, title, sections, ready }`; `ready` is a selector that exists only once data has drawn |
| `src/styles/main.scss` | any new `wuk-` styles, under a comment naming the page |
| `README.md` | the source in "Data sources and licences", if it's new |

## 5. Check it

Run the `check-page` skill: real data, fixture data, axe, 360px phone width, e2e. Read
every generated sentence out loud: is it true, and does it read like a magazine?

## 6. Commit

On a branch, in one commit: the page, script, styles, wiring, tests and any committed data
(e.g. `data/mot/*.json`).
