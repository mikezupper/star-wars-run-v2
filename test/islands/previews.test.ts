import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPreview, installLinkPreviews } from '../../src/previews.js';

afterEach(() => vi.unstubAllGlobals());
describe('optional previews', () => {
  it('uses a cacheable GET and leaves the original link usable on failures', async () => {
    const signal = new AbortController().signal;
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ name: 'Luke' }))
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetch);
    expect(await fetchPreview('/characters/luke/', signal)).toEqual({ name: 'Luke' });
    expect(fetch).toHaveBeenCalledWith('/api/preview?path=%2Fcharacters%2Fluke%2F', { signal });
    expect(await fetchPreview('/characters/no-such-page/', signal)).toBeUndefined();
    expect(await fetchPreview('/characters/luke/', signal)).toBeUndefined();
  });
  it('does not install on touch-only devices or a document without a browser', () => {
    const getElementById = vi.fn();
    installLinkPreviews({ defaultView: null } as unknown as Document);
    installLinkPreviews({
      defaultView: { matchMedia: () => ({ matches: false }) },
      getElementById,
    } as unknown as Document);
    expect(getElementById).not.toHaveBeenCalled();
  });
});
