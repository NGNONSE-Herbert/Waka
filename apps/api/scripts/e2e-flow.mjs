// Parcours de bout en bout contre une API démarrée (par défaut http://localhost:4000) :
// OTP → recherche → réservation → paiement MOCK → webhook signé (simulateur) → CONFIRMED.
// Usage : node scripts/e2e-flow.mjs [baseUrl]
import { randomUUID } from 'node:crypto';

const base = process.argv[2] ?? 'http://localhost:4000';
let cookie = '';
async function call(method, path, body, headers = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-waka-request': '1', ...(cookie ? { cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}
const step = (label, v) => console.log(`✔ ${label}${v ? ` : ${v}` : ''}`);

const health = await call('GET', '/v1/health');
step('santé', `${health.status} / db ${health.db} / PSP ${health.provider.mode}`);
const start = await call('POST', '/v1/auth/otp/start', { phone: '+237 690 000 001' });
step('OTP envoyé (SMS simulé)', start.maskedPhone);
const v = await call('POST', '/v1/auth/otp/verify', { challengeId: start.challengeId, code: start.devCode, acceptedTermsVersion: 'cgu-2026-11-v1' });
step('connectée', v.user.displayName);
const search = await call('GET', '/v1/trips?from=DLA&to=YDE');
const trip = search.items.find((t) => t.seatsAvailable >= 1);
step('recherche DLA → YDE', `${search.items.length} trajets ; choisi ${trip.departureAt} — ${trip.totalPerSeat} FCFA frais inclus`);
const booking = await call('POST', '/v1/bookings', { tripId: trip.id, seats: 1 }, { 'idempotency-key': randomUUID() });
step('places réservées', `${booking.state}, total ${booking.price.total} FCFA, hold jusqu’à ${booking.holdExpiresAt}`);
const payment = await call('POST', `/v1/bookings/${booking.id}/payments`, { channel: 'MTN_MOMO', payerPhone: '+237 690 000 001' }, { 'idempotency-key': randomUUID() });
step('paiement initié', `${payment.state} (${payment.stateLabel}) ref ${payment.mockProviderRef}`);
const before = await call('GET', `/v1/bookings/${booking.id}`);
step('avant webhook', before.state);
const sim = await call('POST', `/v1/dev/mock-psp/${payment.mockProviderRef}/complete`, { outcome: 'SUCCEEDED' });
step('webhook signé livré par le PSP simulé', `${sim.status} → ${sim.outcome}`);
const after = await call('GET', `/v1/bookings/${booking.id}`);
step('réservation', `${after.state} ; paiement ${after.payment.state} (${after.payment.stateLabel}) ; PIN ${after.boardingPin}`);
if (after.state !== 'CONFIRMED') {
  console.error('ÉCHEC : la réservation n’est pas CONFIRMED');
  process.exit(1);
}
