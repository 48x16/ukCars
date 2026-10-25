---
name: check-page
description: Verifies a Rev Counter page in a real browser before it ships, on real data and on CI's fixture data. Checks generated sentences, axe (WCAG 2.2 AA), phone-width overflow and console errors, then runs the e2e suite. Use after building or changing any page, before committing, or when CI's end-to-end or accessibility checks fail.
---

# Check a page

Unit tests prove the numbers; this proves the page. Do both data passes: real data finds
wrong sentences, and fixture data finds crashes on empty lists (which is what CI uses).

## 1. Real data, dev server

Make sure `public/data/` is current (`npm run data:cached`). Then start, or restart, the dev
server: it hangs after big data rebuilds.

```sh
npm run dev -- --port 5173 --strictPort        # in the background
node .claude/skills/check-page/scripts/check-page.mjs <page>
```

The script prints every generated sentence (the `#…-summary` elements and the hero), then axe
violations, sideways overflow and console errors at 1280px and 360px. It exits 1 on any
problem. For pages whose content waits for input (tools), pass `--ready '<selector>'`, or test
the interaction with a short Playwright script.

**Read every sentence.** Is it true against the numbers? Grammatical for every value it can
take (plurals, "1 car", lower-casing acronyms like VIN)? Does it overclaim, e.g. "sold" for
"registered", or a cause the data can't show? Try the edge cases: the smallest make, the
first and last item in a picker.

## 2. Fixture data, production build (as CI does)

```sh
cp -r public/data <scratchpad>/data-backup     # data:fixture replaces it
npm run data:fixture && npm run build
npx playwright test                            # all specs, desktop + phone
rm -rf public/data && cp -r <scratchpad>/data-backup public/data   # always restore
```

To run one page: `npx playwright test -g "<page title>"`.

## Reading failures

| Symptom | Usual cause | Fix |
| --- | --- | --- |
| `toBeAttached` timeout on the ready selector | the selector changed, or the page threw on fixture data | update the spec's `ready`; guard empty lists with `emptyNote()` |
| axe `color-contrast` | text on a shaded cell or the pink accent at small sizes | use `.wuk-heat__cell[data-step]` (contrast built in), or ink text |
| axe `target-size` | linked list rows under 24px | add `.wuk-road__models--links` |
| axe `duplicate-id` | a container id reused across sections | rename one; ids are page-wide |
| sideways overflow at 360px | a grid without `minmax(0, 1fr)`, wide tables, slide-in animations | `minmax(0, 1fr)`, wrap tables in `.wuk-table-scroll`, `overflow-x: clip` |
| a page works in dev but not after build | missing from `vite.config.js` input or precache | add it to both |

## Environment notes

- Playwright uses the installed Edge (`channel: 'msedge'`); its own browsers aren't installed.
- Run axe through `browser.newContext()` pages.
- No Python here: write any scratch scripts in Node.
