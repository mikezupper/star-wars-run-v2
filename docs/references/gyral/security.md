---
title: Security
description: Escape template data, protect form requests, keep secrets out of hydration seeds, and serve Gyral with a strict Content Security Policy.
useWhen: handling user input, CSRF, uploaded files, trusted markup or a Content Security Policy
section: Guides
order: 21
---

# Security

Render untrusted text through a normal template hole:

```ts
// src/greeting.ts
import { html } from '@gyral/core';

export const greeting = (name: string) => html`<p>Hello, <bdi>${name}</bdi>.</p>`;
```

Gyral writes child strings as text and escapes them in server output. Attribute values are
escaped too. This protects the HTML boundary; it does not decide whether a URL, CSS value,
request or uploaded file is safe for your application.

## Trusted markup and URLs

`raw()` accepts trusted author HTML. It does not sanitize it. Never pass a user's comment,
translation, query parameter or network response to `raw()` without a separately chosen
sanitization policy. Use ordinary template holes for text and explicit elements for rich text.

For links from untrusted data, parse the URL at the boundary and allow only the schemes and
origins your application needs. Escaping `href` cannot make a `javascript:` URL safe. Treat
interpolated CSS, page styles and head scripts as trusted author code too. Follow the
[OWASP XSS prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
when choosing allowed contexts and sanitizers.

## Form requests and CSRF

Authenticate and authorize each state-changing request on the server, and validate the
submitted data there even when the browser already validated it. Browser validation improves
the interface; it is not an authorization boundary.

For a cookie-authenticated app, use your server's CSRF protection. Gyral's HTTP driver can
carry a token supplied in the document:

```ts
// src/api.ts
import { csrfFromMeta, makeHttpDriver } from '@gyral/http';

export const api = makeHttpDriver({ headers: csrfFromMeta('csrf-token') });
```

The server renders the session's token in a `meta` element named `csrf-token` and validates
the `x-csrf-token` request header. A native no-JavaScript form post needs the server's
corresponding hidden-field token mechanism. Restrict this driver to your own trusted API;
do not send a token to arbitrary destinations. `SameSite` cookies are useful defense in
depth, but are not a universal replacement for server CSRF checks. See
[OWASP's CSRF guide](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

## Hydration seeds and secrets

SSR sends model state, declared props and store state to the browser so hydration can resume.
Those values are public to anyone who receives the page. Keep credentials, private backend
data and privileged tokens out of them. Use JSON-safe values; functions, DOM nodes and cyclic
objects cannot be faithfully restored. Gyral diagnoses unsafe seed values and escapes JSON
for its HTML context; escaping does not make a secret private.

`defineForm(schema, { secret: [...] })` prevents named fields from being echoed in rejected
form values. Password-like fields are secret by default. This does not redact arbitrary
copies you put in state, application logs or your own error payloads. Return only the
information the browser needs. See [Forms](/docs/forms/).

## A strict Content Security Policy

The SSR package can add hashes for component and page styles while preserving your other
directives:

```ts
// server/page.ts
import { html } from '@gyral/core';
import { renderPage } from '@gyral/ssr';

export const response = renderPage({
  title: 'Account',
  body: html`<main><h1>Account</h1></main>`,
  csp: {
    directives: {
      'default-src': "'self'",
      'script-src': "'self'",
      'object-src': "'none'",
      'base-uri': "'none'",
      'frame-ancestors': "'none'",
      'trusted-types': 'gyral',
      'require-trusted-types-for': "'script'",
    },
  },
});
```

Where Trusted Types exist, Gyral parses templates through the policy named `gyral`. That
policy accepts trusted author markup; it is not a sanitizer. Allow its name in your CSP. If
the page refuses the policy, development warns; an enforced HTML sink still rejects the
operation. Support varies by browser; keep CSP's other protections in place.

### Style hashes from the build

`renderPage({ csp })` hashes the styles of the components imported by the server. A server or
proxy that only builds the header, without importing your components, can take the hashes
from the build instead. After the client build (`gyral({ components: true })`), and
before `.vite` is deleted, `writeComponentStyleManifest` from `@gyral/ssr/static` imports the
app's component modules in a separate Node process and writes their real `<style>` hashes to a
JSON file:

```ts
// scripts/style-manifest.ts
import { writeComponentStyleManifest } from '@gyral/ssr/static';

await writeComponentStyleManifest({
  root: '.',
  clientDir: 'dist/client',
  outFile: 'dist/server/component-styles.json',
});
```

The file is `{ "schema": 1, "hashes": ["'sha256-…'"] }`. The server passes the hashes as
`componentStyleHashes`, to `contentSecurityPolicy()` or `renderPage({ csp })`:

```ts
// server/csp.ts
import { readFileSync } from 'node:fs';
import { contentSecurityPolicy } from '@gyral/ssr';

const manifest = JSON.parse(readFileSync('dist/server/component-styles.json', 'utf8')) as {
  readonly schema: 1;
  readonly hashes: readonly string[];
};

export const csp = await contentSecurityPolicy({
  componentStyleHashes: manifest.hashes,
  directives: { 'default-src': "'self'", 'script-src': "'self'", 'object-src': "'none'" },
});
```

The build runs your component modules, so they must be safe to import in Node; split a
browser-only module from its component definition first. Pass `vite` with aliases or plugins
the modules need. Ship the JSON with the HTML and assets of the same build, and regenerate it
with every release: an old hash blocks new styles.

On a static host, deliver CSP as an HTTP response header where the host allows it. A
`<meta http-equiv>` policy is the fallback for hosts that can't set headers, and it can't set
`frame-ancestors` ([Deploying](/docs/deploying/#content-security-policy)). Review the
[SSR CSP options](/docs/server-rendering/#content-security-policy) and
[style-attribute policy](/docs/styling/#inline-styles-under-a-strict-csp). Test the production
page under its actual headers rather than relying on the development server.

## Uploaded files

Use `FormData` so the browser generates the multipart boundary; do not set its content type
by hand. On the server, enforce file count and size limits, validate content, and control
storage names and download permissions. A filename or MIME type supplied by the client is
untrusted. The [file-upload recipe](/docs/forms/#file-uploads) shows the transport boundary.
