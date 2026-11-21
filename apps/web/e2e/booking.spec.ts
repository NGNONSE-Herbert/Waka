import { expect, test } from '@playwright/test';

/**
 * Parcours critique passager (MOCK) :
 * recherche → détail → connexion OTP (devCode) → réservation → paiement via simulateur → billet CONFIRMED.
 */
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test.beforeAll(async ({ request }) => {
  const ok = await request
    .get(`${API_URL}/v1/health`, { timeout: 5_000 })
    .then((r) => r.ok())
    .catch(() => false);
  test.skip(!ok, `API injoignable sur ${API_URL} — lancez « pnpm --filter @waka/api dev » (mode MOCK) puis relancez.`);
});

test('recherche → réservation → paiement MOCK → billet confirmé', async ({ page }) => {
  // 1. Accueil → recherche Douala → Yaoundé
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Vous allez');
  await page.locator('#h-from').selectOption('DLA');
  await page.locator('#h-to').selectOption('YDE');
  await page.getByRole('button', { name: /Voir les trajets/ }).click();
  await expect(page).toHaveURL(/\/recherche\?from=DLA&to=YDE/);

  // 2. Premier trajet non complet
  const card = page.locator('a[href^="/trajets/"]').filter({ hasNotText: 'Complet' }).first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/\/trajets\//);
  await expect(page.getByText('Contribution conducteur').first()).toBeVisible();

  // 3. Connexion (redirection puis retour automatique)
  await page.getByRole('link', { name: /Connectez-vous pour réserver/ }).locator('visible=true').first().click();
  await expect(page).toHaveURL(/\/connexion\?next=/);
  await page.locator('#phone').fill('690000004');
  await page.getByRole('button', { name: /Recevoir le code/ }).click();
  const devCode = page.getByTestId('dev-code');
  await expect(devCode).toBeVisible();
  await page.getByRole('button', { name: /Remplir automatiquement/ }).click();
  await page.locator('#terms').check();
  await page.getByRole('button', { name: /^Se connecter$/ }).last().click();
  await expect(page).toHaveURL(/\/trajets\//);

  // 4. Réservation
  await page.getByRole('button', { name: /^Réserver ·/ }).locator('visible=true').first().click();
  await expect(page).toHaveURL(/\/reservations\/.+\/paiement/);

  // 5. Paiement : canal par défaut MTN MoMo, numéro, transparence
  await page.locator('#payerPhone').fill('690000004');
  await page.locator('#consent').check();
  await page.getByTestId('pay-submit').click();
  await expect(page.getByTestId('payment-pending')).toBeVisible();

  // 6. Simulateur MOCK : « Valider »
  await expect(page.getByText('Simulateur MOCK — aucun argent réel')).toBeVisible();
  await page.getByTestId('sim-approve').click();

  // 7. Succès UNIQUEMENT quand l’API renvoie CONFIRMED (polling 2,5 s)
  await expect(page.getByTestId('payment-confirmed')).toBeVisible({ timeout: 45_000 });
  await page.getByRole('link', { name: /Voir mon billet/ }).click();

  // 8. Billet
  await expect(page.getByTestId('booking-state')).toHaveAttribute('data-state', 'CONFIRMED');
  await expect(page.getByTestId('boarding-pin')).toHaveText(/^\d{4}$/);
  await expect(page.getByTestId('payment-state')).toContainText('Fonds gérés par notre partenaire de paiement');
});
