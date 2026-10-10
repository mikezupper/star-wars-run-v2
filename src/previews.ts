// A single native hovercard for main-content links. CSS owns placement; ordinary links keep
// their navigation on touch, without JavaScript, and when the optional preview fetch fails.
import { previewPath, type ArticlePreview } from './domain/preview.js';
import { fieldLabel, SECTION_LABELS, TEXT } from './labels.js';

export async function fetchPreview(
  path: string,
  signal: AbortSignal,
): Promise<ArticlePreview | undefined> {
  try {
    const response = await fetch(`/api/preview?${new URLSearchParams({ path }).toString()}`, {
      signal,
    });
    return response.ok ? ((await response.json()) as ArticlePreview) : undefined;
  } catch {
    return undefined;
  }
}

export function installLinkPreviews(doc: Document): void {
  const view = doc.defaultView;
  if (
    view === null ||
    !view.matchMedia('(hover: hover) and (pointer: fine)').matches ||
    !('showPopover' in HTMLElement.prototype) ||
    !('ariaDescribedByElements' in Element.prototype) ||
    !CSS.supports('position-area', 'bottom') ||
    !CSS.supports('position-anchor', 'auto') ||
    doc.getElementById('link-preview') !== null
  )
    return;
  const main = doc.querySelector('main');
  if (main === null) return;
  const card = doc.createElement('aside');
  card.id = 'link-preview';
  card.popover = 'auto';
  card.setAttribute('aria-labelledby', 'link-preview-title');
  doc.body.append(card);
  const cache = new Map<string, ArticlePreview>();
  let active: HTMLAnchorElement | undefined;
  let suppressed: HTMLAnchorElement | undefined;
  let described: string | null = null;
  let request: AbortController | undefined;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    request?.abort();
    if (active !== undefined) {
      delete active.dataset['previewAnchor'];
      if (described === null) active.removeAttribute('aria-describedby');
      else active.setAttribute('aria-describedby', described);
    }
    active = undefined;
  };
  const hide = (dismiss = false) => {
    const source = active;
    const restoreFocus = dismiss && card.contains(doc.activeElement);
    if (dismiss)
      suppressed = restoreFocus || source?.matches(':hover, :focus-within') ? source : undefined;
    stop();
    if (card.matches(':popover-open')) card.hidePopover();
    if (restoreFocus) source?.focus();
  };
  const maybeHide = () => {
    clearTimeout(hideTimer);
    // A short crossing delay bridges the gap, and focus keeps the card persistent.
    hideTimer = setTimeout(() => {
      if (!active?.matches(':hover, :focus-within') && !card.matches(':hover, :focus-within'))
        hide();
    }, 250);
  };
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text: string) => {
    const element = doc.createElement(tag);
    element.textContent = text;
    return element;
  };
  const render = (preview: ArticlePreview) => {
    const title = node('h2', '');
    title.id = 'link-preview-title';
    const link = node('a', preview.name);
    link.href = preview.path;
    title.append(link);
    const description = node('p', preview.lead);
    description.id = 'link-preview-description';
    const facts = node('dl', '');
    for (const fact of preview.facts)
      facts.append(node('dt', fieldLabel(fact.name)), node('dd', fact.value));
    const close = node('button', TEXT.closePreview);
    close.type = 'button';
    close.addEventListener('click', () => {
      hide(true);
    });
    card.replaceChildren(
      title,
      node(
        'p',
        `${SECTION_LABELS[preview.section].one} · ${preview.era === 'canon' ? TEXT.canon : TEXT.legends}`,
      ),
      description,
      facts,
      close,
    );
    return description;
  };
  const begin = (link: HTMLAnchorElement, delay: number) => {
    if (link === suppressed || link === active) return;
    const path = previewPath(link.href, view.location.origin);
    if (
      path === undefined ||
      path === view.location.pathname ||
      link.closest('[data-search-palette]') !== null
    )
      return;
    hide();
    active = link;
    described = link.getAttribute('aria-describedby');
    const controller = new AbortController();
    request = controller;
    showTimer = setTimeout(() => {
      void (async () => {
        const preview = cache.get(path) ?? (await fetchPreview(path, controller.signal));
        if (controller.signal.aborted || active !== link || preview === undefined) return;
        if (!cache.has(path)) {
          if (cache.size >= 40) cache.delete(cache.keys().next().value ?? '');
          cache.set(path, preview);
        }
        const description = render(preview);
        link.dataset['previewAnchor'] = '';
        // Element references can describe a shadow link with content in its parent document.
        link.ariaDescribedByElements = [...(link.ariaDescribedByElements ?? []), description];
        card.showPopover({ source: link });
      })();
    }, delay);
  };
  const inMain = (element: Node): boolean => {
    const root = element.getRootNode();
    return main.contains(element) || (root instanceof ShadowRoot && inMain(root.host));
  };
  const sourceOf = (event: Event): HTMLAnchorElement | undefined => {
    const link = event
      .composedPath()
      .find((n): n is HTMLAnchorElement => n instanceof HTMLAnchorElement);
    return link !== undefined && inMain(link) ? link : undefined;
  };
  const enter = (event: Event) => {
    if (event instanceof PointerEvent && event.pointerType === 'touch') return;
    const link = sourceOf(event);
    if (link !== undefined) begin(link, event.type === 'focusin' ? 0 : 200);
  };
  const leave = (event: Event) => {
    const link = sourceOf(event);
    const { relatedTarget } = event as FocusEvent | PointerEvent;
    if (link === undefined || (relatedTarget instanceof Node && link.contains(relatedTarget)))
      return;
    if (suppressed === link) suppressed = undefined;
    maybeHide();
  };
  const listen = (root: Document | ShadowRoot) => {
    root.addEventListener('pointerover', enter);
    root.addEventListener('focusin', enter);
    root.addEventListener('pointerout', leave);
    root.addEventListener('focusout', leave);
    // Transitions between shadow children do not escape their root. SSR roots exist now.
    for (const element of root.querySelectorAll('*'))
      if (element.shadowRoot !== null && inMain(element)) listen(element.shadowRoot);
  };
  listen(doc);
  card.addEventListener('pointerenter', () => {
    clearTimeout(hideTimer);
  });
  card.addEventListener('pointerleave', maybeHide);
  card.addEventListener('focusout', maybeHide);
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && card.matches(':popover-open')) {
      event.preventDefault();
      hide(true);
    }
  });
  card.addEventListener('toggle', () => {
    if (!card.matches(':popover-open') && active?.dataset['previewAnchor'] !== undefined) {
      suppressed = active.matches(':hover, :focus-within') ? active : undefined;
      stop();
    }
  });
  doc.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') hide();
  });
  view.addEventListener('pagehide', () => {
    hide();
  });
}

// The page module is render-blocking, so wait for main to exist before installing delegation.
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  if (document.readyState === 'loading')
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        installLinkPreviews(document);
      },
      {
        once: true,
      },
    );
  else installLinkPreviews(document);
}
