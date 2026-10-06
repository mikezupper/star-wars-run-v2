// HTTP range requests for the dev and preview servers: DuckDB-WASM reads Parquet files in
// byte ranges (the Explore page), as it does against Caddy in production.

export interface Ranged {
  readonly status: 200 | 206 | 416;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array;
}

/** The response for `body` given a `Range` header (one `bytes=` range; anything else gets all). */
export function ranged(body: Uint8Array, range: string | undefined): Ranged {
  const size = body.byteLength;
  const whole: Ranged = {
    status: 200,
    headers: { 'accept-ranges': 'bytes', 'content-length': String(size) },
    body,
  };
  const match = /^bytes=(\d*)-(\d*)$/.exec(range?.trim() ?? '');
  if (match === null || (match[1] === '' && match[2] === '')) return whole;
  let start: number;
  let end: number;
  if (match[1] === '') {
    // "bytes=-500": the last 500 bytes.
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || start > end) {
    return {
      status: 416,
      headers: { 'content-range': `bytes */${String(size)}` },
      body: new Uint8Array(),
    };
  }
  return {
    status: 206,
    headers: {
      'accept-ranges': 'bytes',
      'content-range': `bytes ${String(start)}-${String(end)}/${String(size)}`,
      'content-length': String(end - start + 1),
    },
    body: body.subarray(start, end + 1),
  };
}
