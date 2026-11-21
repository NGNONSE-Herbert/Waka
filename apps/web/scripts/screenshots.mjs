/**
 * Captures d’écran client (390 px et 1440 px) : accueil, résultats, détail trajet, connexion,
 * paiement (formulaire + simulateur MOCK), billet confirmé.
 * Prérequis : API (4000, MOCK) + web (3000) démarrés. Usage : pnpm --filter @waka/web screenshots
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'screenshots');
const H = { 'X-Waka-Request': '1' };

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

async function api(page, method, url, data, headers = {}) {
  const res = await page.request.fetch(`${BASE}/api${url}`, { method, data, headers: { ...H, ...headers } });
  const body = await res.json().catch(() => null);
  if (!res.ok()) throw new Error(`${method} ${url} → ${res.status()} ${JSON.stringify(body)}`);
  return body;
}

for (const width of [390, 1440]) {
  const mobile = width < 600;
  const ctx = await browser.newContext({
    viewport: { width, height: mobile ? 844 : 900 },
    deviceScaleFactor: mobile ? 2 : 1,
    locale: 'fr-FR',
    timezoneId: 'Africa/Douala',
    reducedMotion: 'reduce',
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await ctx.newPage();
  const shot = async (name, full = true) => {
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(600);
    if (full) {
      // Capture pleine page : barres fixes/collantes remises dans le flux pour éviter les artefacts.
      await page.addStyleTag({ content: "body{position:relative} header.sticky,.sticky{position:relative!important;top:auto!important} .fixed.inset-x-0.bottom-0,[class*=\"bottom-[calc\"].fixed{position:absolute!important} nextjs-portal{display:none!important}" });
    }
    const file = path.join(OUT, `${name}-${width}.png`);
    await page.screenshot({ path: file, fullPage: full });
    console.log('✓', path.relative(process.cwd(), file));
  };

  await page.goto(`${BASE}/`);
  await shot('01-accueil');

  await page.goto(`${BASE}/recherche?from=DLA&to=YDE&seats=1`);
  await shot('02-resultats');

  const search = await api(page, 'GET', '/v1/trips?from=DLA&to=YDE&seats=1&limit=20');
  const trip = search.items.find((t) => t.seatsAvailable >= 1 && t.status === 'PUBLISHED');
  if (!trip) throw new Error('Aucun trajet disponible DLA → YDE');
  await page.goto(`${BASE}/trajets/${trip.id}`);
  await shot('03-detail-trajet');

  // Connexion (écran avec code de démo)
  await page.goto(`${BASE}/connexion`);
  // Un compte de démo par largeur, pour rester sous la limite de débit OTP de l’API.
  await page.locator('#phone').fill(mobile ? (process.env.SHOT_PHONE_MOBILE ?? '690000001') : (process.env.SHOT_PHONE_DESKTOP ?? '690000004'));
  await page.getByRole('button', { name: /Recevoir le code/ }).click();
  await page.getByTestId('dev-code').waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: /Remplir automatiquement/ }).click();
  await page.locator('#terms').check();
  await shot('04-connexion-otp', false);
  await page.getByRole('button', { name: /^Se connecter$/ }).last().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/connexion'), { timeout: 30_000 });

  const booking = await api(page, 'POST', '/v1/bookings', { tripId: trip.id, seats: 1 }, { 'Idempotency-Key': randomUUID() });
  await page.goto(`${BASE}/reservations/${booking.id}/paiement`);
  await page.locator('#payerPhone').waitFor();
  await page.locator('#payerPhone').fill(mobile ? (process.env.SHOT_PHONE_MOBILE ?? '690000001') : (process.env.SHOT_PHONE_DESKTOP ?? '690000004'));
  await page.locator('#consent').check();
  await shot('05-paiement-formulaire');

  await page.getByTestId('pay-submit').click();
  await page.getByTestId('sim-approve').waitFor({ timeout: 30_000 });
  await shot('06-paiement-simulateur-mock');

  await page.getByTestId('sim-approve').click();
  await page.getByTestId('payment-confirmed').waitFor({ timeout: 45_000 });
  await shot('07-paiement-confirme', false);

  await page.goto(`${BASE}/reservations/${booking.id}`);
  await page.getByTestId('boarding-pin').waitFor({ timeout: 20_000 });
  await shot('08-billet');

  await ctx.close();
}

await browser.close();
