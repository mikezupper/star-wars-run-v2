import { describe, expect, it } from 'vitest';
import { componentsFor, storeComponents } from '../../src/render/assets.js';

describe('component metadata in data files and the API image', () => {
  it('survives JSON with loader imports, component CSS and development scripts intact', () => {
    const components = {
      loader: '/assets/components.js',
      preload: ['/assets/core.js'],
      scripts: ['/@vite/client'],
      modules: new Map([
        [
          'swr-explore',
          {
            preload: ['/assets/explore.js'],
            stylesheets: ['/assets/explore.css'],
          },
        ],
      ]),
    };
    const stored = storeComponents(components);
    const restored = componentsFor({
      stylesheet: '/assets/site.css',
      page: '/assets/page.js',
      components: JSON.parse(JSON.stringify(stored)) as typeof stored,
    });
    expect(restored).toEqual(components);
  });

  it('leaves a build with no component assets alone', () => {
    expect(componentsFor({ stylesheet: '/style.css', page: '/page.js' })).toBeUndefined();
  });
});
