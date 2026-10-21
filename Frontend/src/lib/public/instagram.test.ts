import { describe, expect, it } from 'vitest';
import { displayHandle, instagramDmUrl, instagramUrl, normaliseHandle } from './instagram';

describe('normaliseHandle', () => {
  it.each([
    'maison._abeer',
    '@maison._abeer',
    '  @Maison._Abeer  ',
    'https://www.instagram.com/maison._abeer/',
    'instagram.com/maison._abeer?igsh=1',
  ])('reads %j as maison._abeer', (raw) => {
    expect(normaliseHandle(raw)).toBe('maison._abeer');
  });

  it('leaves a valid but different handle alone', () => {
    expect(normaliseHandle('maisonabeer')).toBe('maisonabeer');
  });

  it.each(['', null, undefined, '@@x', 'a b', 'a..b', 'a'.repeat(31), 'javascript:alert(1)'])(
    'rejects %j',
    (raw) => {
      expect(normaliseHandle(raw)).toBeNull();
    },
  );

  it('accepts exactly 30 characters', () => {
    expect(normaliseHandle('a'.repeat(30))).toBe('a'.repeat(30));
  });
});

describe('the URL helpers', () => {
  it('build every link from the parsed handle', () => {
    expect(instagramUrl(' @Maison._Abeer ')).toBe('https://instagram.com/maison._abeer');
    expect(instagramDmUrl('https://instagram.com/maison._abeer/')).toBe(
      'https://ig.me/m/maison._abeer',
    );
    expect(displayHandle('maison._abeer')).toBe('@maison._abeer');
  });

  it.each([null, undefined, '', 'a..b', 'javascript:alert(1)'])('return null for %j', (raw) => {
    expect(instagramUrl(raw)).toBeNull();
    expect(instagramDmUrl(raw)).toBeNull();
    expect(displayHandle(raw)).toBeNull();
  });
});
