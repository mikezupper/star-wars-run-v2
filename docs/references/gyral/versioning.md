---
title: Versioning and stability
description: Understand Gyral's 0.x API policy, package versions, migration guides, internal entry points and the difference between releases and tester tarballs.
section: Reference
order: 4
---

# Versioning and stability

Gyral is in **0.x**. A minor version can include breaking changes. Read its migration guide
and package changelogs before upgrading; do not treat every 0.x minor as an interchangeable
dependency update.

## Public and internal APIs

Use documented public package entries. Entries containing `/internal` are for Gyral's own
packages and have no stability promise. A symbol being technically exported does not make
an internal entry an application API. The
[0.3.1 export inventory](https://github.com/gyraljs/gyral/blob/next/docs/references/public-api-0.3.1.md)
records the public boundary.

The `@gyral/*` packages release together at a shared version. Keep core, router, HTTP, time,
testing, devtools and SSR aligned; verify your lockfile when a package manager resolves
multiple versions. The [package guide](/docs/packages/) explains what each app needs.

## Releases and tester builds

These guides describe **0.3.1**. Public installation instructions use released npm packages;
check that your chosen version is available on the registry before upgrading. Internal tester
builds may carry a `-next` suffix without a corresponding npm prerelease. They are for
release verification and are outside the public installation path.

For a released application, pin the registry version you verified and retain the lockfile.
Deploy server output and client assets from the same build: stale HTML with new component
templates can cause hydration mismatches. Versioned hashed assets help keep that agreement.

## Upgrade with evidence

1. Read the relevant guide: [0.2 to 0.3](/docs/migrating-0-2-to-0-3/) or
   [0.3.0 to 0.3.1](/docs/migrating-0-3-0-to-0-3-1/).
2. Update packages together and install from the lockfile.
3. Run typechecking, component/browser tests and the production build.
4. Test server/client hydration, edited forms, routing and the production CSP if your app
   uses them. Check payload size for the pages whose loading matters.

The generated [API reference](/docs/api/) describes the packages installed for this site's
build. Consult the changelog for the exact version your app runs:
[core](https://github.com/gyraljs/gyral/blob/main/packages/core/CHANGELOG.md),
[HTTP](https://github.com/gyraljs/gyral/blob/main/packages/http/CHANGELOG.md),
[router](https://github.com/gyraljs/gyral/blob/main/packages/router/CHANGELOG.md),
[SSR](https://github.com/gyraljs/gyral/blob/main/packages/ssr/CHANGELOG.md) and the other package
directories. Report a regression with the versions, a small reproducer and the expected
behavior. The repository's `pnpm check` is its release-quality gate.
