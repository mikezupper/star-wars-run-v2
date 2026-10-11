---
title: Browser storage
description: Typed localStorage and IndexedDB drivers: persist values, watch settings, query records and run atomic transactions.
section: Guides
order: 7.6
---

# Browser storage

Storage is a driver effect. Keep reads/writes out of reducers, init and views. The optional
`@gyral/core/storage` entry adds no storage code to apps that do not import it. Factories and
imports are safe on the server; browser access starts only when commands run.

## localStorage

```ts
// src/theme-storage.ts
import { command, define, html } from '@gyral/core';
import { makeLocalStorageDriver, type StorageError, type StorageOutput } from '@gyral/core/storage';
import * as v from 'valibot';

const settings = makeLocalStorageDriver(v.object({ theme: v.string() }), { prefix: 'app:' });
interface State {
  readonly theme: string;
  readonly error?: StorageError;
}
type Msg =
  | { readonly _tag: 'Stored'; readonly result: StorageOutput<{ theme: string }> }
  | { readonly _tag: 'Failed'; readonly error: StorageError }
  | { readonly _tag: 'Dark' };

export const Theme = define<State, Msg>()('my-storage-theme', {
  init: () => ({ theme: 'light' }),
  subscriptions: () => [
    command(
      settings,
      { _tag: 'Watch', key: 'settings' },
      {
        key: 'settings-watch',
        onSuccess: (result) => ({ _tag: 'Stored', result }),
        onFailure: (error) => ({ _tag: 'Failed', error }),
      },
    ),
  ],
  intent: { Dark: true },
  update: {
    Stored: (s, m) =>
      m.result._tag === 'StorageChanged' && m.result.entry.found
        ? { theme: m.result.entry.value.theme }
        : s,
    Failed: (s, m) => ({ ...s, error: m.error }),
    Dark: (s) => [
      s,
      [
        command(
          settings,
          {
            _tag: 'Write',
            key: 'settings',
            value: { theme: 'dark' },
          },
          { key: 'settings-write', onFailure: (error) => ({ _tag: 'Failed', error }) },
        ),
      ],
    ],
  },
  view: (s, i) =>
    html`<p>${s.theme}</p>
      <button type="button" data-intent=${i.Dark}>Dark theme</button>`,
});
```

`Read { key }` returns `StorageValue` with `entry: { found: false }` or
`{ found: true, value }`. `Write { key, value }`, `Remove { key }` and `Clear` return
completion tags. Clear removes only the configured prefix (default empty: all localStorage).
Watch emits an initial snapshot, then changes from driver writes (`source: 'driver'`) and
native events in other tabs (`'tab'`). Direct same-tab localStorage writes are not observed.
Removal/clear emit absence. A malformed Watch value emits `StorageDecodeFailed` and leaves
the watch running; Read rejects with `StorageDecodeError`. Access/quota/security failures
go through `StorageAccessError` and command `onFailure`. Handle both watch output variants.

The Standard Schema decodes parsed JSON, including async validation. If it transforms the
input, configure `encode(value)` to reconstruct its JSON input shape. No transactions or
cross-tab atomicity are promised. Use distinct command keys for watches and writes. Abort
removes listeners and suppresses late decoder results. Tests use `fakeDriver(settings)`
with `el.drivers = { localStorage: fake }`, or an isolated `storage: () => storageObject`.

Initial watches belong in `subscriptions`: the server's seed hydrates first, then browser
storage updates the model. Keep server-rendered state JSON-compatible.

## IndexedDB

Use the separate `@gyral/core/indexeddb` entry for structured records, object stores,
indexes, migrations and atomic transaction batches. It uses the same command and fake-driver
conventions, with native IndexedDB semantics:

```ts
// src/contacts-storage.ts
import { command, type Command } from '@gyral/core';
import {
  makeIndexedDBDriver,
  type IndexedDBError,
  type IndexedDBOutput,
} from '@gyral/core/indexeddb';
import * as v from 'valibot';

const stores = { contacts: v.object({ id: v.string(), name: v.string() }) };
type Contact = v.InferOutput<typeof stores.contacts>;
const contacts = makeIndexedDBDriver(stores, {
  database: 'address-book',
  version: 1,
  upgrade: (db, oldVersion) => {
    if (oldVersion < 1) {
      const store = db.createObjectStore('contacts', { keyPath: 'id' });
      store.createIndex('name', 'name');
    }
  },
});
type Msg =
  | { readonly _tag: 'Database'; readonly result: IndexedDBOutput<typeof stores> }
  | { readonly _tag: 'Failed'; readonly error: IndexedDBError };
const handlers = {
  onSuccess: (result: IndexedDBOutput<typeof stores>): Msg => ({ _tag: 'Database', result }),
  onFailure: (error: IndexedDBError): Msg => ({ _tag: 'Failed', error }),
};
export const readContact = (id: string): Command<Msg> =>
  command(contacts, { _tag: 'Read', store: 'contacts', key: id }, handlers);
export const saveContacts = (values: readonly Contact[]): Command<Msg> =>
  command(
    contacts,
    {
      _tag: 'Transaction',
      operations: values.map(
        (value) =>
          ({
            _tag: 'Put',
            store: 'contacts',
            value,
          }) as const,
      ),
    },
    { ...handlers, concurrency: 'queue' },
  );
export const findContacts = (name: string): Command<Msg> =>
  command(
    contacts,
    {
      _tag: 'Query',
      store: 'contacts',
      index: 'name',
      range: { _tag: 'Only', key: name },
      limit: 20,
    },
    handlers,
  );
```

`Read` returns `Record` with a found/absent entry. `Put` returns its actual primary key
(optional input key, or the store's inline/auto-increment key); `Delete` returns `Deleted`.
`Query` returns `Records` with primary keys and decoded values. Queries require a positive
integer limit, allow `direction` (`next`, `prev`, `nextunique`, `prevunique`), and optional
range data: Only/Lower/Upper with `key`, or Bound with `lower`/`upper`. Bounds accept `open`,
`lowerOpen` and `upperOpen` as appropriate. Store names/record values are typed; index names
are strings defined by the application migration and checked by the browser.

A nonempty Transaction batch queues all requests synchronously across its stores and
returns `Committed { results }` in operation order after the native transaction completes.
Read-only batches use readonly transactions; batches containing Put/Delete use readwrite.
A failure aborts the whole batch. Stored Read/Query values decode after commit, including
async schemas; a decode failure carries `committed: true`, so earlier batch writes remain.
An optional `encode(store, value)` reconstructs a transforming schema's stored input shape.

The version and synchronous `upgrade(db, oldVersion, newVersion, transaction)` callback
belong to the application. Queue migration requests before returning; never await. A blocked
upgrade rejects with `IndexedDBBlockedError`, aborts any abandoned late upgrade and closes
any late connection. Retry explicitly once older connections close. Migration/access/native
transaction failures use `IndexedDBAccessError`; invalid query limits/empty batches use
`IndexedDBInputError`; invalid persisted records use `IndexedDBDecodeError`.

Abort attempts rollback and suppresses late output; it cannot undo an already committed
transaction. Connections close after each native transaction, before async decoding, and
on versionchange. No resources open on import/factory creation. Start browser reads after
the first render (init commands or subscriptions), and keep SSR model state JSON-compatible.
Tests substitute `fakeDriver(contacts)` by name (`indexeddb` by default). No storage watches
or automatic cross-tab synchronization are promised for this driver.
