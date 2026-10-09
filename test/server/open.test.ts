import { describe, expect, it, vi } from 'vitest';
import { openOnce } from '../../src/server/open.js';

describe('openOnce', () => {
  it('opens on first use and keeps what it opened', async () => {
    const open = vi.fn(() => Promise.resolve('api'));
    const api = openOnce(open);
    expect(open).not.toHaveBeenCalled();
    expect(await api()).toBe('api');
    expect(await api()).toBe('api');
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('shares one open between requests that arrive while it is opening', async () => {
    const open = vi.fn(() => Promise.resolve('api'));
    const api = openOnce(open);
    expect(await Promise.all([api(), api()])).toEqual(['api', 'api']);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('tries again after a failed open, as when the build was rewriting the files', async () => {
    const open = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('archive.duckdb: no such file'))
      .mockResolvedValueOnce('api');
    const api = openOnce(open);
    await expect(api()).rejects.toThrow('no such file');
    expect(await api()).toBe('api');
    expect(await api()).toBe('api');
    expect(open).toHaveBeenCalledTimes(2);
  });
});
