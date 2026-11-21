import { describe, expect, it } from 'vitest';
import { cmE164, dateTime, doualaIso, duration, formatCmLocal, hourOf, isCmMobile, money, remaining, time, todayInDouala } from '../lib/format';

const NBSP = ' ';

describe('montants', () => {
  it('« 5 500 FCFA » avec espaces insécables', () => {
    expect(money(5500)).toBe(`5${NBSP}500${NBSP}FCFA`);
    expect(money(500)).toBe(`500${NBSP}FCFA`);
    expect(money(1250000)).toBe(`1${NBSP}250${NBSP}000${NBSP}FCFA`);
  });
  it('anglais', () => {
    expect(money(5500, 'en')).toBe(`5,500${NBSP}FCFA`);
  });
});

describe('dates (Africa/Douala, UTC+1)', () => {
  it('format « sam. 28 nov. · 08:00 »', () => {
    expect(dateTime('2026-11-28T07:00:00Z')).toBe('sam. 28 nov. · 08:00');
    expect(time('2026-11-28T07:00:00Z')).toBe('08:00');
  });
  it('heure décimale et ISO local', () => {
    expect(hourOf('2026-11-28T17:30:00Z')).toBe(18.5);
    expect(doualaIso('2026-11-28', '08:00')).toBe('2026-11-28T08:00:00+01:00');
    expect(todayInDouala(new Date('2026-11-28T23:30:00Z'))).toBe('2026-11-29');
  });
  it('durées', () => {
    expect(duration(240)).toBe(`4${NBSP}h`);
    expect(duration(210)).toBe(`3${NBSP}h${NBSP}30`);
    expect(duration(45)).toBe(`45${NBSP}min`);
  });
  it('compte à rebours', () => {
    const now = Date.parse('2026-11-28T08:00:00Z');
    expect(remaining('2026-11-28T08:09:30Z', now)).toEqual({ total: 570_000, m: 9, s: 30 });
    expect(remaining('2026-11-28T07:00:00Z', now).total).toBe(0);
  });
});

describe('téléphone camerounais', () => {
  it('saisie progressive', () => {
    expect(formatCmLocal('690000001')).toBe('690 000 001');
    expect(formatCmLocal('+237 6900')).toBe('690 0');
    expect(formatCmLocal('69000000123')).toBe('690 000 001');
  });
  it('validation et E.164', () => {
    expect(isCmMobile('690 000 001')).toBe(true);
    expect(isCmMobile('+237690000001')).toBe(true);
    expect(isCmMobile('290000001')).toBe(false);
    expect(isCmMobile('69000')).toBe(false);
    expect(cmE164('690 000 001')).toBe('+237690000001');
  });
});
