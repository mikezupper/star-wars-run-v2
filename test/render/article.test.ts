import { describe, expect, it } from 'vitest';
import { titleFit } from '../../src/render/article.js';

describe('titleFit', () => {
  it('leaves titles whose words all fit a phone alone', () => {
    expect(titleFit('Luke Skywalker')).toBeUndefined();
    expect(titleFit('Millennium Falcon')).toBeUndefined();
    expect(titleFit('Twelve-letter')).toBeUndefined();
  });

  it('rounds the longest word up to a step', () => {
    expect(titleFit('Temm (disambiguation)')).toBe(17); // 16 characters
    expect(titleFit('Holodocumentarian')).toBe(17);
    expect(titleFit('Starwarsholidayspecial.com')).toBe(29);
    expect(titleFit('Interrogation droid')).toBe(13);
  });

  it('ends a word at spaces, hyphens and slashes, where a line may break', () => {
    expect(titleFit('Communication/entertainment system')).toBe(13);
    expect(titleFit('YI-5 Surveillance/Interrogation droid')).toBe(13);
  });

  it('caps the longest words at the last step', () => {
    expect(titleFit('Supercalifragilisticexpialidocious-ness')).toBe(29);
    expect(titleFit('A'.repeat(40))).toBe(29);
  });
});
