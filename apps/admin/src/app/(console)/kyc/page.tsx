'use client';

import { useMemo, useState } from 'react';
import { Car, FileLock2, IdCard, UserRound } from 'lucide-react';
import { useApi } from '@/lib/use-api';
import { adminPath, callAdmin, ApiRequestError } from '@/lib/api';
import { arr, bool, list, num, obj, str, type Obj } from '@/lib/normalize';
import { dateOnly, dateTime, expiry, maskPlate, type ExpiryTone } from '@/lib/format';
import { can } from '@/lib/permissions';
import { RequireScreen, useSession } from '@/components/session';
import { Drawer } from '@/components/drawer';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, KeyValue, LoadingBlock, Notice, PageHeader, TableWrap, Textarea, cn, td, th, tr, type Tone } from '@/components/ui';

interface DocDate { label: string; date: string | null }
interface KycItem {
  kind: 'DRIVER' | 'VEHICLE';
  id: string;
  title: string;
  subtitle: string;
  submittedAt: string | null;
  status: string | null;
  isDemo: boolean;
  dates: DocDate[];
  fields: { k: string; v: string }[];
  hasDocument: boolean;
}

const DOC_TYPE: Record<string, string> = { CNI: 'Carte nationale d’identité', PASSPORT: 'Passeport', RESIDENCE_PERMIT: 'Titre de séjour' };

function driverItem(d: unknown): KycItem | null {
  const id = str(d, 'userId', 'id', 'driverId');
  if (!id) return null;
  return {
    kind: 'DRIVER',
    id,
    title: str(d, 'fullName', 'displayName', 'user.displayName', 'name') ?? 'Conducteur',
    subtitle: str(d, 'maskedPhone', 'user.maskedPhone', 'phoneMasked') ?? 'Profil conducteur',
    submittedAt: str(d, 'submittedAt', 'createdAt'),
    status: str(d, 'kycStatus', 'status'),
    isDemo: bool(d, 'isDemo', 'user.isDemo') ?? false,
    dates: [{ label: 'Permis de conduire', date: str(d, 'licenseExpiry') }],
    fields: [
      { k: 'Pièce d’identité', v: DOC_TYPE[str(d, 'idDocumentType') ?? ''] ?? str(d, 'idDocumentType') ?? '—' },
      { k: 'N° de permis', v: str(d, 'licenseNumberMasked', 'maskedLicenseNumber') ?? 'Stocké haché — non affiché' },
      { k: 'Covoiturage privé déclaré', v: bool(d, 'declaresPrivateCarpoolOnly') === false ? 'Non' : bool(d, 'declaresPrivateCarpoolOnly') ? 'Oui (attestation)' : '—' },
    ],
    hasDocument: Boolean(str(d, 'idDocumentRef', 'idDocumentUploadRef') ?? bool(d, 'hasDocument')),
  };
}

function vehicleItem(v: unknown): KycItem | null {
  const id = str(v, 'id', 'vehicleId');
  if (!id) return null;
  const label = str(v, 'label') ?? ([str(v, 'make'), str(v, 'model')].filter(Boolean).join(' ') || 'Véhicule');
  return {
    kind: 'VEHICLE',
    id,
    title: label,
    subtitle: `${maskPlate(str(v, 'plateMasked', 'maskedPlate', 'plate'))}${str(v, 'color') ? ` · ${str(v, 'color')}` : ''}`,
    submittedAt: str(v, 'createdAt', 'submittedAt'),
    status: str(v, 'reviewStatus', 'status'),
    isDemo: bool(v, 'isDemo', 'owner.isDemo') ?? false,
    dates: [
      { label: 'Assurance', date: str(v, 'insuranceExpiry') },
      { label: 'Visite technique', date: str(v, 'inspectionExpiry') },
    ],
    fields: [
      { k: 'Propriétaire', v: str(v, 'ownerName', 'owner.displayName', 'driverName') ?? '—' },
      { k: 'Année', v: str(v, 'year') ?? '—' },
      { k: 'Places', v: num(v, 'seatsTotal') !== null ? String(num(v, 'seatsTotal')) : '—' },
      { k: 'Plaque', v: maskPlate(str(v, 'plateMasked', 'maskedPlate', 'plate')) },
    ],
    hasDocument: false,
  };
}

function normalizeQueue(raw: unknown): KycItem[] {
  const root = obj(raw, 'queue') ?? obj(raw);
  const drivers = arr(root, 'drivers', 'pendingDrivers');
  const vehicles = arr(root, 'vehicles', 'pendingVehicles');
  const out: KycItem[] = [];
  if (drivers.length || vehicles.length) {
    drivers.forEach((d) => { const x = driverItem(d); if (x) out.push(x); });
    vehicles.forEach((v) => { const x = vehicleItem(v); if (x) out.push(x); });
  } else {
    for (const it of list(raw)) {
      const kind = str(it, 'kind', 'type', 'entityType')?.toUpperCase();
      const x = kind?.startsWith('VEH') ? vehicleItem((it as Obj).vehicle ?? it) : driverItem((it as Obj).driver ?? it);
      if (x) out.push(x);
    }
  }
  return out.sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''));
}

const EXPIRY_TONE: Record<ExpiryTone, Tone> = { expired: 'red', soon: 'amber', ok: 'green', unknown: 'neutral' };

function ExpiryCell({ d }: { d: DocDate }) {
  const e = expiry(d.date);
  return (
    <span className="inline-flex flex-col">
      <span className="tnum text-[13px]">{dateOnly(d.date)}</span>
      <Badge tone={EXPIRY_TONE[e.tone]} className="mt-0.5 w-fit">{e.label}</Badge>
    </span>
  );
}

export default function KycPage() {
  return (
    <RequireScreen screen="kyc">
      <KycInner />
    </RequireScreen>
  );
}

function KycInner() {
  const { me } = useSession();
  const { data, error, loading, reload } = useApi<unknown>(adminPath('kycQueue'));
  const items = useMemo(() => (data !== undefined ? normalizeQueue(data) : []), [data]);
  const [filter, setFilter] = useState<'ALL' | 'DRIVER' | 'VEHICLE'>('ALL');
  const [selected, setSelected] = useState<KycItem | null>(null);
  const shown = items.filter((i) => filter === 'ALL' || i.kind === filter);
  const flagged = items.filter((i) => i.dates.some((d) => expiry(d.date).tone !== 'ok')).length;

  return (
    <>
      <PageHeader
        eyebrow="Confiance & KYC"
        title="Vérifications en attente"
        description="Revue humaine des conducteurs et véhicules. Seuls les champs non sensibles sont affichés ; les pièces restent dans le stockage chiffré."
      />
      <Card>
        <CardHeader
          title={<>File de revue <span className="tnum ml-1 text-ink">({items.length})</span></>}
          subtitle={flagged ? <span className="text-amber-ink">{flagged} dossier(s) avec un document expiré ou proche de l’expiration</span> : 'Plus ancien en premier'}
          actions={
            <div role="group" aria-label="Filtrer par type" className="inline-flex rounded-lg border border-line-strong p-0.5">
              {(['ALL', 'DRIVER', 'VEHICLE'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn('h-7 rounded-md px-2.5 text-[12.5px] font-medium', filter === f ? 'bg-night text-white' : 'text-ink hover:bg-muted')}
                >
                  {f === 'ALL' ? 'Tout' : f === 'DRIVER' ? 'Conducteurs' : 'Véhicules'}
                </button>
              ))}
            </div>
          }
        />
        {error ? <ErrorState error={error} onRetry={reload} /> : null}
        {loading && data === undefined ? <LoadingBlock /> : null}
        {!loading && !error && shown.length === 0 ? <EmptyState title="Aucune vérification en attente" icon={<IdCard className="size-5" />}>La file est vide pour ce filtre.</EmptyState> : null}
        {shown.length > 0 ? (
          <TableWrap label="File des vérifications KYC">
            <table className="data-table w-full min-w-[760px]">
              <thead>
                <tr>
                  <th scope="col" className={th}>Dossier</th>
                  <th scope="col" className={th}>Type</th>
                  <th scope="col" className={th}>Échéances documents</th>
                  <th scope="col" className={th}>Soumis</th>
                  <th scope="col" className={th}><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((it) => (
                  <tr key={`${it.kind}-${it.id}`} className={tr}>
                    <td className={td}>
                      <div className="flex items-center gap-2.5">
                        <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-muted text-ink">{it.kind === 'DRIVER' ? <UserRound className="size-4" /> : <Car className="size-4" />}</span>
                        <div>
                          <p className="font-medium">{it.title} {it.isDemo ? <Badge tone="violet" className="ml-1">Démo</Badge> : null}</p>
                          <p className="text-[12px] text-ink">{it.subtitle}</p>
                        </div>
                      </div>
                    </td>
                    <td className={td}>{it.kind === 'DRIVER' ? 'Conducteur' : 'Véhicule'}</td>
                    <td className={td}>
                      <div className="flex gap-4">
                        {it.dates.map((d) => (
                          <div key={d.label}>
                            <p className="text-[11px] uppercase tracking-wide text-ink-soft">{d.label}</p>
                            <ExpiryCell d={d} />
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className={cn(td, 'text-ink')}>{dateTime(it.submittedAt)}</td>
                    <td className={cn(td, 'text-right')}>
                      <Button size="sm" onClick={() => setSelected(it)}>Examiner</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : null}
      </Card>

      <KycDrawer item={selected} canDecide={can(me.roles, 'kyc:review')} mfa={me.mfaVerified} onClose={() => setSelected(null)} onDone={() => { setSelected(null); reload(); }} />
    </>
  );
}

function KycDrawer({ item, canDecide, mfa, onClose, onDone }: { item: KycItem | null; canDecide: boolean; mfa: boolean; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [err, setErr] = useState<ApiRequestError | null>(null);
  const reasonOk = reason.trim().length >= 5 && reason.trim().length <= 500;

  async function decide(approve: boolean) {
    if (!item) return;
    setBusy(approve ? 'approve' : 'reject');
    setErr(null);
    try {
      await callAdmin(item.kind === 'DRIVER' ? 'kycDecision' : 'vehicleDecision', { params: { id: item.id }, body: { approve, reason: reason.trim() } });
      setReason('');
      onDone();
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e : new ApiRequestError(0, 'CLIENT_ERROR', String(e), null));
    } finally {
      setBusy(null);
    }
  }

  const expiredAny = item?.dates.some((d) => expiry(d.date).tone === 'expired');

  return (
    <Drawer
      open={item !== null}
      onOpenChange={(o) => { if (!o) { onClose(); setErr(null); setReason(''); } }}
      title={item ? item.title : ''}
      description={item ? `${item.kind === 'DRIVER' ? 'Profil conducteur' : 'Véhicule'} · soumis ${dateTime(item.submittedAt)}` : undefined}
      footer={
        item && canDecide ? (
          <div className="space-y-3">
            <Field label="Motif de la décision" required hint="Obligatoire (5 à 500 caractères). Visible dans le journal d’audit.">
              {(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Ex. : permis valide, identité cohérente avec la pièce." className="min-h-20" />}
            </Field>
            {!mfa ? <Notice tone="red">MFA requise pour décider : reconnectez-vous.</Notice> : null}
            {err ? <ErrorState error={err} title="Décision refusée par l’API" /> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="danger" disabled={!reasonOk || !mfa} loading={busy === 'reject'} onClick={() => void decide(false)}>Refuser</Button>
              <Button variant="primary" disabled={!reasonOk || !mfa || Boolean(expiredAny)} loading={busy === 'approve'} onClick={() => void decide(true)} title={expiredAny ? 'Un document est expiré : approbation impossible' : undefined}>
                Approuver
              </Button>
            </div>
          </div>
        ) : undefined
      }
    >
      {item ? (
        <div className="space-y-5">
          <section aria-labelledby="kyc-dates">
            <h3 id="kyc-dates" className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink">Échéances</h3>
            <ul className="space-y-2">
              {item.dates.map((d) => {
                const e = expiry(d.date);
                return (
                  <li key={d.label} className={cn('flex items-center justify-between rounded-lg border px-3 py-2', e.tone === 'expired' ? 'border-danger/30 bg-danger-soft' : e.tone === 'soon' ? 'border-amber/50 bg-amber-soft' : 'border-line')}>
                    <span className="text-sm font-medium">{d.label}</span>
                    <span className="flex items-center gap-2 text-sm"><span className="tnum">{dateOnly(d.date)}</span><Badge tone={EXPIRY_TONE[e.tone]}>{e.label}</Badge></span>
                  </li>
                );
              })}
            </ul>
            {expiredAny ? <div className="mt-2"><Notice tone="red">Document expiré : le dossier ne peut pas être approuvé en l’état.</Notice></div> : null}
          </section>
          <section aria-labelledby="kyc-fields">
            <h3 id="kyc-fields" className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink">Informations (non sensibles)</h3>
            <KeyValue items={item.fields.map((f) => ({ k: f.k, v: f.v }))} />
          </section>
          {item.kind === 'DRIVER' ? (
            <section aria-labelledby="kyc-doc">
              <h3 id="kyc-doc" className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink">Pièce justificative</h3>
              <div className="flex items-start gap-3 rounded-lg border border-dashed border-line-strong bg-muted p-3">
                <FileLock2 aria-hidden className="mt-0.5 size-5 shrink-0 text-ink" />
                <p className="text-[13px] text-ink">
                  <span className="font-medium text-text">Référence de document privée</span> — consultation via stockage chiffré (non disponible en démo).
                  {item.hasDocument ? null : ' Aucune référence transmise.'}
                </p>
              </div>
            </section>
          ) : null}
          {!canDecide ? <Notice tone="neutral">Lecture seule : votre rôle ne permet pas de décider (permission kyc:review).</Notice> : null}
        </div>
      ) : null}
    </Drawer>
  );
}
