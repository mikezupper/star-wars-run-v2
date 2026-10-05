# ADR 0006 — Workflow: beads for work, the repo for knowledge, CI on demand

Status: **accepted** (2026-10-05). Local CI: `swr-3mo.12`.

## Context

This repo follows the harness-engineering approach: agents do most of the work, and anything
they can't read in the repo, they can't use. That idea comes with two places to put plans
(execution-plan files in `docs/`, or an issue tracker). It also assumes CI on every push,
which the owner doesn't want to pay GitHub Actions minutes for.

## Decision

- **Beads (`bd`) is the only task tracker.** Plans, tasks, bugs, discovered work and
  technical debt are beads with dependencies, not Markdown files. There is no
  `docs/exec-plans/` directory and no TODO file. Issue prefix: `swr`.
- **`docs/` holds knowledge that lasts:** decisions (this folder), product specs,
  references, lessons learned. If a fact matters next month, it goes here; if it only
  matters until a bead closes, it goes in the bead.
- **The beads database syncs through the GitHub repo**, on `refs/dolt/data`. Push it with
  `bd dolt push`. `.beads/config.yaml` is committed; the database itself is not.
- **Agents may commit and push** (owner decision, 2026-10-05). Commits carry no
  attribution trailers. The beads git hooks are deliberately **not installed**: their
  `prepare-commit-msg` hook adds an `Executed-By:` trailer.
- **CI runs locally, and only when the owner asks.** Workflows in `.github/workflows/` use
  only `workflow_dispatch` triggers and run with `gh act` in Docker, through
  `pnpm ci:local`. A check script rejects `push`, `pull_request` and `schedule` triggers,
  so a workflow can never spend GitHub Actions minutes.
- **Lessons learned:** when a real bug is fixed, add an entry to
  [docs/lessons-learned.md](../lessons-learned.md) with its symptom, cause, fix and guard.

## Consequences

- `bd ready` decides what to do next. Run `bd prime` at the start of every session.
- Without CI on push, `pnpm check` before every commit is the only gate. Agents must run it.
- A rule that keeps getting broken should become a lint rule or a check script, not more
  prose. Lint rules live in `eslint.config.js`; repo checks in `scripts/check-*.mjs`, run by
  `pnpm invariants`.
