// Asset metadata survives JSON in pages.sqlite and the code-only API bundle. Gyral uses a
// Map at render time; store entries so neither JSON.stringify nor Vite's define loses it.
import type { ComponentAssets } from '@gyral/ssr';

export type StoredComponents = Omit<ComponentAssets, 'modules'> & {
  readonly modules: readonly (readonly [
    string,
    { readonly preload: readonly string[]; readonly stylesheets: readonly string[] },
  ])[];
};

export interface Assets {
  readonly stylesheet: string;
  /** The every-page script: search key, theme toggle and service worker registration. */
  readonly page: string;
  readonly components?: StoredComponents;
  /** Legacy data builds used a manual entry. New code can still render their Explore page. */
  readonly clientEntry?: string;
}

export const storeComponents = (assets: ComponentAssets): StoredComponents => ({
  ...assets,
  modules: [...assets.modules],
});

export const restoreComponents = (assets: StoredComponents): ComponentAssets => ({
  ...assets,
  modules: new Map(assets.modules),
});

/** Old pages.sqlite files name the one Explore entry; let rendered tags select it too. */
export function componentsFor(assets: Assets): ComponentAssets | undefined {
  if (assets.components !== undefined) return restoreComponents(assets.components);
  if (assets.clientEntry === undefined) return undefined;
  return {
    loader: assets.clientEntry,
    modules: new Map([['swr-explore', { preload: [], stylesheets: [] }]]),
  };
}
