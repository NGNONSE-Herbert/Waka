'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, BadgeCheck, CalendarClock, CheckCircle2, CircleDashed, Landmark, Scale, ShieldAlert } from 'lucide-react';
import { useApi } from '@/lib/use-api';
import { adminPath } from '@/lib/api';
import { isObj, num, obj, pairs, str } from '@/lib/normalize';
import { dateOnly, dateTime, dayShort, fcfa, int } from '@/lib/format';
import { BOOKING_STATE_LABEL, PRIORITY_LABEL, paymentLabel } from '@/lib/models';
import { canSee } from '@/lib/permissions';
import { useSession } from '@/components/session';
import { BarList, Columns, SplitBar, type Datum } from '@/components/charts';
import { Badge, Card, CardHeader, ErrorState, LoadingBlock, Notice, PageHeader, Skeleton, cn } from '@/components/ui';

interface Cockpit {
  upcomingTotal: number | null;
  upcomingByDay: Datum[];
  bookingsByState: Datum[];
  held: number | null;
  feesRecognized: number | null;
  feesDeferred: number | null;
  disputes: Datum[];
  disputesOpen: number | null;
  overdue: number | null;
  kycDrivers: number | null;
  kycVehicles: number | null;
  kycTotal: number | null;
  recoStatus: string | null;
  recoDay: string | null;
  recoRanAt: string | null;
  anomalies: number | null;
  generatedAt: string | null;
  paymentsByState: Datum[];
  disclaimer: string | null;
}

const PRIORITY_COLOR: Record<string, string> = { SAFETY: '#B42318', HIGH: '#C98A0B', NORMAL: '#6B7884' };

function normalizeDashboard(raw: unknown): Cockpit {
  const d = obj(raw, 'dashboard', 'data') ?? obj(raw) ?? {};
  const upRaw = d.upcomingTrips ?? obj(d, 'trips')?.upcoming ?? d.tripsUpcoming;
  const upByDay = pairs(Array.isArray(upRaw) ? upRaw : obj(d, 'trips')?.byDay ?? d.upcomingTripsByDay ?? null, ['day', 'date', 'key']);
  const upcomingTotal = typeof upRaw === 'number' ? upRaw : num(upRaw, 'total', 'count') ?? (upByDay.length ? upByDay.reduce((s, p) => s + p.value, 0) : null);

  const bookings = pairs(d.bookingsByState ?? obj(d, 'bookings')?.byState ?? null);

  const funds = obj(d, 'funds', 'amounts', 'finance', 'money') ?? d;
  const held = num(funds, 'heldByPsp', 'pspHeld', 'heldByPartner', 'psp_held', 'held');
  const feesRecognized = num(funds, 'feesRecognized', 'feeRevenue', 'platformFeeRevenue', 'platform_fee_revenue', 'feesEarned');
  const feesDeferred = num(funds, 'feesDeferred', 'platformFeeDeferred', 'platform_fee_deferred');

  const dispObj = obj(d, 'disputes');
  const prioSrc = d.openDisputesByPriority ?? d.disputesByPriority ?? dispObj?.byPriority ?? dispObj?.openByPriority ?? null;
  const prio = pairs(prioSrc, ['priority', 'key', 'label']);
  const order = ['SAFETY', 'HIGH', 'NORMAL'];
  const disputes: Datum[] = order.map((k) => ({ key: k, label: PRIORITY_LABEL[k as 'SAFETY'], value: prio.find((p) => p.key === k)?.value ?? 0, color: PRIORITY_COLOR[k] }));
  const disputesOpen = num(dispObj, 'open', 'openCount', 'total') ?? num(d, 'openDisputes') ?? (prio.length ? prio.reduce((s, p) => s + p.value, 0) : null);

  const kyc = d.pendingKyc ?? d.kycPending ?? d.kyc;
  const kycDrivers = num(kyc, 'drivers', 'pendingDrivers');
  const kycVehicles = num(kyc, 'vehicles', 'pendingVehicles');
  const kycTotal = typeof kyc === 'number' ? kyc : num(kyc, 'total', 'pending') ?? (kycDrivers !== null || kycVehicles !== null ? (kycDrivers ?? 0) + (kycVehicles ?? 0) : null);

  const reco = obj(d, 'reconciliation', 'lastReconciliation');
  const anomaliesRaw = d.openAnomalies ?? d.anomalies;
  return {
    upcomingTotal,
    upcomingByDay: upByDay.map((p) => ({ key: p.key, label: /^\d{4}-\d{2}-\d{2}/.test(p.key) ? dayShort(p.key.slice(0, 10)) : p.key, value: p.value })),
    bookingsByState: bookings.map((p) => ({ key: p.key, label: BOOKING_STATE_LABEL[p.key] ?? p.key, value: p.value })).sort((a, b) => b.value - a.value),
    held,
    feesRecognized,
    feesDeferred,
    disputes,
    disputesOpen,
    overdue: num(dispObj, 'overdue', 'overdueCount') ?? num(d, 'overdueDisputes'),
    kycDrivers,
    kycVehicles,
    kycTotal,
    recoStatus: str(reco, 'status'),
    recoDay: str(reco, 'day'),
    recoRanAt: str(reco, 'ranAt'),
    anomalies: typeof anomaliesRaw === 'number' ? anomaliesRaw : Array.isArray(anomaliesRaw) ? anomaliesRaw.length : num(anomaliesRaw, 'open', 'count', 'total'),
    generatedAt: str(d, 'generatedAt', 'asOf') ?? (isObj(raw) ? str(raw, 'generatedAt') : null),
    paymentsByState: pairs(d.paymentsByState ?? obj(d, 'payments')?.byState ?? null)
      .map((p) => ({ key: p.key, label: paymentLabel(p.key, null), value: p.value }))
      .sort((a, b) => b.value - a.value),
    disclaimer: str(funds, 'disclaimer'),
  };
}

function Kpi({ label, value, sub, icon, tone = 'default', href, linkLabel }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon: React.ReactNode; tone?: 'default' | 'alert' | 'ok'; href?: string; linkLabel?: string }) {
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-medium text-ink">{label}</p>
        <span aria-hidden className={cn('grid size-7 place-items-center rounded-lg', tone === 'alert' ? 'bg-danger-soft text-danger' : tone === 'ok' ? 'bg-brand-soft text-brand-deep' : 'bg-muted text-ink')}>{icon}</span>
      </div>
      <p className="tnum mt-2 font-display text-[26px] font-bold leading-none text-text">{value}</p>
      {sub ? <div className="mt-2 text-[12px] text-ink">{sub}</div> : null}
      {href ? (
        <Link href={href} className="mt-auto inline-flex items-center gap-1 pt-3 text-[12.5px] font-medium text-brand-strong hover:underline">
          {linkLabel ?? 'Ouvrir'} <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      ) : null}
    </Card>
  );
}

export default function CockpitPage() {
  const { me } = useSession();
  const { data, error, loading, reload } = useApi<unknown>(adminPath('dashboard'));
  const c = data !== undefined ? normalizeDashboard(data) : null;
  const seeDisputes = canSee(me.roles, 'disputes');
  const seeKyc = canSee(me.roles, 'kyc');
  const seeFinance = canSee(me.roles, 'finance');

  return (
    <>
      <PageHeader
        eyebrow="Cockpit"
        title={`Bonjour ${me.displayName.split(' ')[0] ?? ''}`.trim()}
        description={c?.generatedAt ? <>Indicateurs calculés côté serveur — état au {dateTime(c.generatedAt)} (heure de Douala).</> : 'Indicateurs calculés côté serveur, en temps réel.'}
      />
      {error ? <Card><ErrorState error={error} onRetry={reload} /></Card> : null}
      {loading && !c ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Card key={i} className="space-y-3 p-4"><Skeleton className="w-1/2" /><Skeleton className="h-7 w-1/3" /><Skeleton className="w-2/3" /></Card>)}
        </div>
      ) : null}
      {c ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Trajets à venir" value={int(c.upcomingTotal)} icon={<CalendarClock className="size-4" />} sub="Trajets publiés, départ futur" />
            <Kpi
              label="Litiges ouverts"
              value={int(c.disputesOpen)}
              tone={(c.disputes[0]?.value ?? 0) > 0 ? 'alert' : 'default'}
              icon={<Scale className="size-4" />}
              sub={
                <span className="flex flex-wrap gap-1.5">
                  {(c.disputes[0]?.value ?? 0) > 0 ? <Badge tone="red" icon={<ShieldAlert aria-hidden className="size-3" />}>{c.disputes[0]?.value} sécurité</Badge> : <span>Aucun cas sécurité</span>}
                  {c.overdue ? <Badge tone="amber">{c.overdue} en retard</Badge> : null}
                </span>
              }
              href={seeDisputes ? '/litiges' : undefined}
              linkLabel="File des litiges"
            />
            <Kpi
              label="Vérifications KYC en attente"
              value={int(c.kycTotal)}
              icon={<BadgeCheck className="size-4" />}
              sub={c.kycDrivers !== null || c.kycVehicles !== null ? `${int(c.kycDrivers)} conducteur(s) · ${int(c.kycVehicles)} véhicule(s)` : 'Revue humaine obligatoire'}
              href={seeKyc ? '/kyc' : undefined}
              linkLabel="File KYC"
            />
            <RecoKpi c={c} href={seeFinance ? '/finances/rapprochement' : undefined} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
            <Card>
              <CardHeader
                title="Fonds : détenus vs acquis"
                subtitle="Miroir du grand livre de rapprochement (comptes psp_held et platform_fee_revenue)."
              />
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <div>
                  <p className="text-[12.5px] font-medium text-ink">Détenu par le partenaire PSP</p>
                  <p className="tnum mt-1 font-display text-2xl font-bold">{fcfa(c.held)}</p>
                  <p className="mt-1 text-[12px] text-ink">Fonds des bénéficiaires, jamais en trésorerie Waka.</p>
                </div>
                <div>
                  <p className="text-[12.5px] font-medium text-ink">Frais de service acquis</p>
                  <p className="tnum mt-1 font-display text-2xl font-bold text-brand-deep">{fcfa(c.feesRecognized)}</p>
                  <p className="mt-1 text-[12px] text-ink">{c.feesDeferred !== null ? <>Frais encore différés : <span className="tnum font-medium text-text">{fcfa(c.feesDeferred)}</span></> : 'Reconnus après trajet accompli ou décision.'}</p>
                </div>
                {c.held !== null && c.feesRecognized !== null ? (
                  <div className="sm:col-span-2">
                    <SplitBar
                      caption="Répartition entre fonds détenus par le PSP et frais acquis"
                      parts={[
                        { label: 'Détenu par le PSP', value: c.held, color: '#142436' },
                        { label: 'Frais acquis', value: c.feesRecognized, color: '#0E8F83' },
                      ]}
                    />
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  <Notice tone="amber" title="Volume ≠ chiffre d’affaires">
                    {c.disclaimer ?? 'Les montants détenus par le PSP appartiennent aux passagers et conducteurs. Seuls les frais de service acquis constituent un revenu Waka.'}
                  </Notice>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Litiges ouverts par priorité" subtitle="Les cas sécurité sont traités en premier." />
              <div className="p-4">
                <BarList data={c.disputes} caption="Nombre de litiges ouverts par priorité" />
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title="Réservations par état" />
              <div className="p-4">
                {c.bookingsByState.length ? <BarList data={c.bookingsByState} caption="Nombre de réservations par état" /> : <p className="text-sm text-ink">Donnée non fournie par l’API.</p>}
              </div>
            </Card>
            {c.upcomingByDay.length ? (
              <Card>
                <CardHeader title="Départs à venir par jour" subtitle="Heure de Douala" />
                <div className="p-4"><Columns data={c.upcomingByDay} caption="Nombre de trajets à venir par jour de départ" /></div>
              </Card>
            ) : (
              <Card>
                <CardHeader title="Paiements par état" subtitle="Libellés exacts — « demandé » n’est jamais « confirmé »." />
                <div className="p-4">
                  {c.paymentsByState.length ? <BarList wide data={c.paymentsByState} caption="Nombre de paiements par état" /> : <p className="text-sm text-ink">Donnée non fournie par l’API.</p>}
                </div>
              </Card>
            )}
          </div>
        </div>
      ) : null}
      {loading && !c ? <Card className="mt-4"><LoadingBlock /></Card> : null}
    </>
  );
}

function RecoKpi({ c, href }: { c: Cockpit; href?: string }) {
  const status = c.recoStatus;
  const ok = status === 'MATCHED';
  const icon = status === 'DISCREPANCY' ? <AlertTriangle className="size-4" /> : ok ? <CheckCircle2 className="size-4" /> : status ? <CircleDashed className="size-4" /> : <Landmark className="size-4" />;
  const label = status === 'MATCHED' ? 'Concordant' : status === 'DISCREPANCY' ? 'Écart détecté' : status === 'NOT_RUN' ? 'Non lancé' : status ?? '—';
  return (
    <Kpi
      label="Rapprochement PSP ↔ grand livre"
      value={<span className={cn('text-xl', status === 'DISCREPANCY' && 'text-danger')}>{label}</span>}
      tone={status === 'DISCREPANCY' || (c.anomalies ?? 0) > 0 ? 'alert' : ok ? 'ok' : 'default'}
      icon={icon}
      sub={
        <>
          {c.recoDay ? <>Journée du {dateOnly(c.recoDay)}{c.recoRanAt ? ` · lancé ${dateTime(c.recoRanAt)}` : ''}</> : 'Aucune exécution connue'}
          {c.anomalies !== null ? <span className="mt-1 block">{c.anomalies > 0 ? <Badge tone="red">{c.anomalies} anomalie(s) ouverte(s)</Badge> : 'Aucune anomalie ouverte'}</span> : null}
        </>
      }
      href={href}
      linkLabel="Rapprochement"
    />
  );
}

