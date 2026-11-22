import { describe, expect, it } from 'vitest';
import { moderateMessage } from '../src/messaging.js';

describe('messagerie antifraude', () => {
  it.each([
    'Je suis au rond-point Deïdo, voiture grise.',
    'On part à 07:00 le 28/11, soyez à l’heure.',
    'J’ai un sac de 20 kg et une petite valise.',
    'Le trajet coûte 5 500 FCFA, déjà payé dans l’application.',
    'Je donne le code à l’embarquement.',
    'Merci, bonne route !',
  ])('laisse passer : %s', (text) => {
    expect(moderateMessage(text)).toEqual({ ok: true });
  });

  it.each([
    'Regarde https://exemple.test/promo',
    'va sur www.exemple.org',
    'écris-moi sur wa.me/237690000001',
    'mon site arnaque.com pour réserver',
  ])('bloque un lien : %s', (text) => {
    expect(moderateMessage(text)).toEqual({ ok: false, reason: 'LINK' });
  });

  it.each(['Appelle le +237 690 00 00 01', 'mon numéro 690000001', '6.90.00.00.01', 'tel 00237 677 000 002'])('bloque un numéro : %s', (text) => {
    expect(moderateMessage(text)).toEqual({ ok: false, reason: 'PHONE' });
  });

  it.each([
    'Paie-moi en cash à la montée',
    'Tu peux envoyer l’argent par MoMo ?',
    'On règle directement entre nous',
    'En espèces tu me paies moins cher',
    'Pay me directly',
    'Versez sur Orange Money',
  ])('bloque un paiement hors plateforme : %s', (text) => {
    expect(moderateMessage(text)).toEqual({ ok: false, reason: 'OFF_PLATFORM_PAYMENT' });
  });
});
