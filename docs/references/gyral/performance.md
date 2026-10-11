---
title: Performance
description: Measure Gyral's production payload, rendering work and hydration cost, then use keyed rows, structural sharing and islands where they help.
section: Guides
order: 23
---

# Performance

Measure your production page before changing its update strategy. Include the entry, static
imports and modules the page actually fetches; a small entry can still load a large set of
component, hydration and fallback chunks.

## Rendering and keyed rows

Reducers run immediately. One scheduler batches DOM work in a microtask, renders parents
before children, and runs focus and other post-render work after the commit. A message can
trigger a view even when the reducer returns the same state; unchanged binding values do not
rewrite the DOM. Keep views pure and deterministic.

Use `each(items, key, row, pick?)` for lists that insert, remove or reorder items. It skips a
row when its item reference and picked inputs are unchanged. Preserve unchanged objects in
your reducers and put changing external row inputs in `pick`; do not capture outer view state
in the row function. Development checks and the row-purity lint help detect mistakes. See
[Views](/docs/views/) and [Update](/docs/update/).

Child components receive props by property. Unchanged declared props avoid a prop-triggered
render; a child's own messages and stores can still update it. Mutating an object in place
can hide a real change, while rebuilding every unchanged object defeats structural sharing.
For a costly subtree, first isolate it as a component with explicit inputs and measure again.

## Production compilation and payload

Use `gyralVitePreset()` for production builds. It compiles template strings and binding paths
ahead of time and removes development diagnostics. A client-only app can use
`clientOnly: true` to exclude hydration machinery when no server markup needs it. This is a
build contract: do not use that option for a server-rendered page.

The repository's `pnpm size --json` measures production JavaScript with gzip level 9 and
reports the initial payload separately from all chunks. `pnpm size:check` enforces example
budgets. The [package overview](/docs/packages/#whats-inside) and
[migration guide](/docs/migrating-0-2-to-0-3/#size) give dated measurements; they are examples,
not a guarantee of your app's size. Compare versions with the same build options and assets.

## Hydration and loading

Hydration adopts server nodes rather than rebuilding the page. Its first view must agree with
the server's state, props, stores and formatted text. Recovery from a mismatch adds work and
can disturb user input. Read [Server rendering](/docs/server-rendering/) and use production
hydration tests, including forms edited before scripts arrive.

Choose islands when a region can wait until visible, idle or interaction. Keep initial HTML
useful and ensure keyboard users can reach the interactive part. Preload the modules a page
needs using its build manifest; avoid preloading every route just to make one navigation
faster. Automatic component loading and manual route splitting should be measured on the
whole page, including their loader and preload overhead. See
[Code splitting](/docs/code-splitting/) and [Rendering modes](/docs/rendering-modes/).

## Reproduce a speed claim

The 2026-10-06 renderer comparison ran 0.2.0 and the 0.3 candidate in the same calibrated
session. Its [raw data and notes](https://github.com/gyraljs/benchmarks/tree/main/results/2026-10-06-gyral-0.3-final)
describe the machines, versions and variation. That comparison is not a measurement of every
later 0.3.1 feature or your application.

For your page, record network payloads and a browser performance trace for the action users
care about. Separate script, layout, paint and frame wait; fewer reducer milliseconds need
not make the visible action faster. Warm up, repeat the same tasks, retain raw results and
compare in one environment. Check input correctness alongside timings. For bursty external
sources, evaluate `renderOnFrame`; discrete clicks and submits usually need the default
microtask rendering. See [Testing](/docs/testing/).
