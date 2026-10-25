---
name: codebase-onboarding
description: Explains the Rev Counter (ukcars) codebase in levels, from a one-minute overview to an architecture tour to deep dives on one subsystem (pipelines, MOT join, feature pages, charts and maps, PWA, tests, CI/CD). Use when someone is new to the project, asks how it fits together or where something lives, or before changing an unfamiliar part.
---

# Codebase Onboarding Skill

Answer at the lowest level that serves the question, and offer the next level down. Don't
load a level's file until it's needed.

## Progressive Disclosure Levels

### Level 1: The one-minute version (always)

Answer from this section alone:

- **What:** a static PWA about Britain's cars, built from open government data, live at
  https://roads.richyork.co.uk on GitHub Pages.
- **Shape:** a build-time data pipeline plus a static multi-page site. `pipeline/*.js`
  (Node) downloads, validates and summarises the sources into `public/data/**.json`. Vite
  builds about 28 HTML pages; each page has one script in `src/` that fetches its JSON and
  draws it with d3 and plain DOM. No server, no database, no framework.
- **The three folders that matter:** `pipeline/` (data in), `src/` (pages out), `test/` +
  `e2e/` (proof).
- **The one rule to know first:** `npm run data` wipes `public/data/`, so the other pipelines
  run after it (`npm run data:cached` does the lot from the local cache).

### Level 2: Architecture Overview

**Only load when user requests more details.** See [architecture-guide.md](references/architecture-guide.md) for more information.

Cover:
- Directory structure and purpose of each folder
- Architectural pattern (static site + build-time ETL pipeline, multi-page PWA)
- Data flow from source file to the reader's screen

### Level 3: Deep Dives

**Only load when user requests a specific topic.** See [deep-dive-guide.md](references/deep-dive-guide.md).

Topics: the data pipelines and run order; DfT licensing slice; MOT results and the DVSA→DVLA
join; MOT failure items; registrations and make stories; anatomy of a feature page; charts
and maps; service worker and offline; testing; CI/CD and deploy; editorial rules.

## When the answer isn't in the guides

Read the file's header comment first: every pipeline and page module opens with what it does
and why. Then grep. If the guides turn out to be wrong, say so and fix them.
