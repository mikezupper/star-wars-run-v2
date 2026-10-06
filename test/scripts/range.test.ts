import { describe, expect, it } from 'vitest';
import { ranged } from '../../scripts/lib/range.js';

const body = new TextEncoder().encode('0123456789');
const text = (r: ReturnType<typeof ranged>) => new TextDecoder().decode(r.body);

describe('range requests', () => {
  it('serve the whole file without a Range header, and say ranges are accepted', () => {
    const r = ranged(body, undefined);
    expect([r.status, text(r), r.headers['accept-ranges']]).toEqual([200, '0123456789', 'bytes']);
  });

  it('serve a start-end range, an open-ended range and a suffix range', () => {
    expect(text(ranged(body, 'bytes=2-4'))).toBe('234');
    expect(ranged(body, 'bytes=2-4').headers['content-range']).toBe('bytes 2-4/10');
    expect(text(ranged(body, 'bytes=7-'))).toBe('789');
    expect(text(ranged(body, 'bytes=-3'))).toBe('789');
    expect(text(ranged(body, 'bytes=8-99'))).toBe('89');
  });

  it('refuse a range past the end, and ignore what they do not understand', () => {
    expect(ranged(body, 'bytes=10-').status).toBe(416);
    expect(ranged(body, 'bytes=5-2').status).toBe(416);
    expect(ranged(body, 'bytes=0-1,4-5').status).toBe(200);
  });
});
