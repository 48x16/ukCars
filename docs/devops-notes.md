# DevOps notes: Azure DevOps → GitHub, and where Claude fits

Notes from building this project's pipeline, written to bring back to work.

## Gates and judgement

A control room does two different jobs, and they need different tools:

- **Gates** decide automatically whether a change can merge. They must run every time and
  give the same answer every time: CI checks, branch protection, pre-commit hooks.
- **Judgement** asks "is this good?": code review, security review, accessibility review,
  writing the PR. Claude skills are good at this, but only run when invoked, so they
  can't be a gate on their own.

Rule of thumb: **the gate finds the problem; the skill explains and fixes it.**

## Concept map

| Azure DevOps | GitHub | In this repo |
| --- | --- | --- |
| YAML pipeline | Workflow (`.github/workflows/*.yml`) | `ci.yml`, `data-and-deploy.yml`, `codeql.yml` |
| Stage | Job (jobs run in parallel unless `needs:` links them) | `build` → `deploy` |
| Job / step / task | Step, `uses:` an action | `actions/checkout`, `actions/setup-node` |
| Task version (`Npm@1`) | Action pinned to a commit hash | `@3d3c42e… # v7.0.1` |
| Scheduled trigger | `on: schedule: cron` (always UTC) | weekly data refresh |
| Build validation on a branch policy | Required status check in a branch ruleset | `CI / checks` |
| Branch policies (reviewers, linked items) | Rulesets: require PR, block force-push | set up by hand, see below |
| Environment + approvals and checks | Environment (+ required reviewers) | `github-pages` |
| Service connection | `permissions:` + OIDC (`id-token: write`) | deploy job |
| Variable group / secure files | Variables and secrets (repo, environment, org) | none needed yet |
| Pipeline artifact | Artifact (`upload-artifact`) | Playwright report on failure |
| Advanced Security for Azure DevOps | CodeQL, secret scanning, Dependabot (free on public repos) | `codeql.yml`, `dependabot.yml` |
| `$(System.AccessToken)` | `GITHUB_TOKEN`, scoped by `permissions:` | read-only by default |

## Things worth remembering

- **Least privilege by default.** Each workflow starts with `permissions: contents: read`;
  only the deploy job gets `pages: write` and `id-token: write`.
- **Pin actions to a commit hash.** A tag like `v7` can be moved to point at different
  code; a hash can't. Dependabot keeps the hashes up to date.
- **Fail before you deploy.** Validation runs in `build`; `deploy` only runs if `build`
  succeeded, so bad data never replaces good data.
- **Keep PR checks independent of outside services.** CI uses fixture data, so a pull
  request never fails because DfT's site is down.
- **Test the real thing.** Offline support only counted once a test cut the network off
  for the service worker too. Browser "offline" emulation doesn't reach service workers.

## Claude Code pieces

| Piece | What it is | Gate or judgement? |
| --- | --- | --- |
| Skill (`~/.claude/skills/<name>/SKILL.md`) | A written procedure Claude follows when invoked | Judgement |
| Built-in `/code-review`, `/security-review`, `/simplify` | Ready-made review skills | Judgement |
| Hook (`settings.json`) | A command the harness runs on events, e.g. after every edit | Gate (for Claude's own work) |
| `CLAUDE.md` | Project instructions loaded into every session | Context |
| Memory | Facts Claude keeps between sessions | Context |

A good skill says **how**, not just **what**: the exact commands, what to run them against,
how to read the output, and what to do about each kind of finding.

## One-time GitHub setup for this repo

1. **Pages:** Settings → Pages → Source: **GitHub Actions**.
2. **Security:** Settings → Advanced Security: turn on Dependabot alerts, Dependabot
   security updates, and secret scanning with push protection.
3. **Ruleset for `main`:** Settings → Rules → Rulesets → New branch ruleset.
   - Target: default branch. Enforcement: Active.
   - Require a pull request before merging.
   - Require status checks to pass: add `checks` (CI) and `analyze` (CodeQL).
     A check only appears in the picker after it has run once, so open a PR first.
   - Block force pushes.
