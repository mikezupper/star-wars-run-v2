---
title: Versioning and stability
description: Understand Gyral's 0.x API policy, package versions, how to upgrade and which entry points are internal.
useWhen: checking what counts as public API, how releases work, and how to upgrade safely
section: Reference
order: 4
---

# Versioning and stability

Gyral is in **0.x**. A minor version can include breaking changes. Read its upgrade guide
and the package changelogs before moving to it; do not treat every 0.x minor as an
interchangeable dependency update.

## Public and internal APIs

Use documented public package entries. Entries containing `/internal` are for Gyral's own
packages and have no stability promise. A symbol being technically exported does not make
an internal entry an application API. The
[export inventory](https://github.com/gyraljs/gyral/blob/v0.3.8/docs/references/public-api-0.3.1.md)
records the public boundary of 0.3.8: every entry and what it exports.

The `@gyral/*` packages and `create-gyral` release together at a shared version: keep every
`@gyral/*` package your app installs on that one version. Gyral's packages take `@gyral/core` as a
peer at their exact version, so your package manager reports a mismatch when it installs (pnpm
lists the unmet peer, npm stops with `ERESOLVE`), and a package that loads with another release
of core throws [G0016](/errors/#G0016) in development. The
[package guide](/docs/packages/#one-version-of-every-package) explains what each app needs.

## Releases

These guides describe **0.3.8**, the `latest` version on npm. Every package is published
from GitHub Actions with npm provenance; install from the registry. Today npm has releases
only, under the `latest` tag.

For a released application, pin the registry version you verified and retain the lockfile.
Deploy server output and client assets from the same build: stale HTML with new component
templates can cause hydration mismatches. Versioned hashed assets help keep that agreement.

Breaking changes wait for a new minor version, and that release gets an upgrade guide in these
docs. On an older 0.3.x release? Install 0.3.8 and read the
[core changelog](https://github.com/gyraljs/gyral/blob/main/packages/core/CHANGELOG.md).

## Upgrade with evidence

1. Read the changelogs for every release between yours and the target, and the upgrade guide
   when the target is a new minor version.
2. Update packages together and install from the lockfile.
3. Commit, then run `npx @gyral/codemod 0.3.8` from the app's directory. It moves code to
   0.3.8's APIs wherever it can prove the rewrite safe: a spread-in `gyralVitePreset()` becomes
   `plugins: [gyral()]`,
   driver records outside tests become [lists](/docs/effects/#substituting-drivers), and
   `subscription('feed', …)` becomes `subscription(feed, …)` where the module declares the
   `feed` token. It lists every candidate it leaves, with `file:line` and the reason, and only
   writes into a clean git working tree (`--dry` prints the diff instead), so `git diff` shows
   what it did.
4. Run ESLint with `gyral.configs.recommended` from `@gyral/core/eslint`. `gyral/prefer-built-in`
   names code that a built-in replaces, such as a parser that checks modifier keys by hand
   (`on()`), and `gyral/intent-event` an `on()` parser bound to another event
   ([the rules](/docs/packages/#the-eslint-plugin)).
5. Run typechecking, component/browser tests and the production build. In development, a view
   that reads something besides its state, props and stores warns ([G0017](/errors/#G0017)),
   because Gyral skips renders whose inputs are unchanged.
6. Test server/client hydration, edited forms, routing and the production CSP if your app
   uses them. Check payload size for the pages whose loading matters.
7. Update the agent skill your project carries:
   `npx @gyral/mcp@0.3.8 skill` ([coding agents](/docs/coding-agents/#the-agent-skill)).

The generated [API reference](/docs/api/) describes the packages installed for this site's
build. Consult the changelog for the exact version your app runs:
[core](https://github.com/gyraljs/gyral/blob/main/packages/core/CHANGELOG.md),
[HTTP](https://github.com/gyraljs/gyral/blob/main/packages/http/CHANGELOG.md),
[router](https://github.com/gyraljs/gyral/blob/main/packages/router/CHANGELOG.md),
[SSR](https://github.com/gyraljs/gyral/blob/main/packages/ssr/CHANGELOG.md) and the other package
directories. Report a regression with the versions, a small reproducer and the expected
behavior. The repository's `pnpm check` is its release-quality gate.
