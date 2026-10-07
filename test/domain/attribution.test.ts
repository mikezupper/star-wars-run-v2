import { renderToString } from '@gyral/ssr';
import { describe, expect, it } from 'vitest';
import { CC_BY_SA_3, wookieepediaUrl } from '../../src/domain/attribution.js';
import { creditLine } from '../../src/render/credit.js';
import { linkTo } from '../fixtures/html.js';

describe('Wookieepedia attribution', () => {
  it('links articles the way MediaWiki writes their addresses', () => {
    expect(wookieepediaUrl('Luke Skywalker')).toBe(
      'https://starwars.fandom.com/wiki/Luke_Skywalker',
    );
    expect(wookieepediaUrl('Star Wars: Episode IV A New Hope')).toBe(
      'https://starwars.fandom.com/wiki/Star_Wars:_Episode_IV_A_New_Hope',
    );
    expect(wookieepediaUrl('Luke Skywalker/Legends')).toBe(
      'https://starwars.fandom.com/wiki/Luke_Skywalker/Legends',
    );
    expect(wookieepediaUrl('Padmé Amidala')).toBe(
      'https://starwars.fandom.com/wiki/Padm%C3%A9_Amidala',
    );
    expect(wookieepediaUrl('Han Solo & Chewbacca?')).toBe(
      'https://starwars.fandom.com/wiki/Han_Solo_%26_Chewbacca%3F',
    );
  });

  it('credits the source article and the license, and says the text was modified', async () => {
    const html = (await renderToString(creditLine('Luke Skywalker'))).replace(
      /<!--[^>]*-->|<\?>/g,
      '',
    );
    expect(linkTo(html, 'https://starwars.fandom.com/wiki/Luke_Skywalker')?.rel).toBe('external');
    expect(html).toContain('“Luke Skywalker” article on Wookieepedia');
    expect(linkTo(html, CC_BY_SA_3)?.rel).toBe('license external');
    expect(html).toContain('Modified for this site.');
    expect(html).toContain('data-pagefind-ignore');
  });
});
