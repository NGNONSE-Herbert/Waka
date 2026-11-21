'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { CloseDisputeInput, DisputeDecisionInput, RejectDecisionInput, RequestEvidenceInput, TriageInput } from '@waka/contracts';
import { callAdmin, adminPath, ApiRequestError, type AdminRouteKey } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { fcfa } from '@/lib/format';
import { PRIORITY_LABEL, normalizeStaff, type DisputeDetail, type Priority } from '@/lib/models';
import { can, type DisputeActionKey } from '@/lib/permissions';
import { previewSplit, presets } from '@/lib/split';
import { useSession } from '@/components/session';
import { Modal } from '@/components/drawer';
import { Button, ErrorState, Field, Input, Notice, Select, Textarea, cn } from '@/components/ui';

const ROUTE: Record<DisputeActionKey, AdminRouteKey> = {
  assign: 'assign',
  triage: 'triage',
  requestEvidence: 'requestEvidence',
  startReview: 'review',
  propose: 'propose',
  approve: 'approve',
  reject: 'reject',
  close: 'close',
};

const TITLE: Record<DisputeActionKey, string> = {
  assign: 'Attribuer le dossier',
  triage: 'Trier le dossier',
  requestEvidence: 'Demander des pièces',
  startReview: 'Démarrer l’instruction',
  propose: 'Proposer une décision',
  approve: 'Approuver la décision',
  reject: 'Rejeter la proposition',
  close: 'Clôturer le dossier',
};

export function ActionDialog({ action, dispute, onClose, onDone }: { action: DisputeActionKey | null; dispute: DisputeDetail; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiRequestError | null>(null);

  async function submit(body: unknown) {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      await callAdmin(ROUTE[action], { params: { id: dispute.id }, body });
      onDone();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e : new ApiRequestError(0, 'CLIENT_ERROR', String(e), null));
    } finally {
      setBusy(false);
    }
  }

  const close = (o: boolean) => {
    if (!o) {
      setError(null);
      onClose();
    }
  };

  return (
    <Modal open={action !== null} onOpenChange={close} title={action ? TITLE[action] : ''} description={`Dossier #${dispute.id.slice(0, 8)} — l’action est journalisée avec votre identité.`}>
      {action === 'assign' ? <AssignForm busy={busy} onSubmit={submit} currentId={dispute.assignee?.id ?? null} /> : null}
      {action === 'triage' ? <TriageForm busy={busy} onSubmit={submit} current={dispute.priority} /> : null}
      {action === 'startReview' ? <ConfirmForm busy={busy} onSubmit={() => submit({})} label="Démarrer l’instruction" text="Les éléments des deux parties seront examinés. Une décision motivée pourra ensuite être proposée." /> : null}
      {action === 'close' ? <CloseForm busy={busy} onSubmit={submit} /> : null}
      {action === 'requestEvidence' ? <EvidenceForm busy={busy} onSubmit={submit} /> : null}
      {action === 'propose' ? <ProposeForm busy={busy} onSubmit={submit} dispute={dispute} /> : null}
      {action === 'approve' ? <ApproveForm busy={busy} onSubmit={() => submit({})} dispute={dispute} /> : null}
      {action === 'reject' ? <RejectForm busy={busy} onSubmit={submit} /> : null}
      {error ? <div className="-mx-4 mt-2"><ErrorState error={error} title="Action refusée par l’API" /></div> : null}
    </Modal>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-line pt-4">{children}</div>;
}

function ConfirmForm({ busy, onSubmit, label, text, danger }: { busy: boolean; onSubmit: () => void; label: string; text: string; danger?: boolean }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <p className="text-sm text-text">{text}</p>
      <Footer><Button type="submit" variant={danger ? 'danger' : 'primary'} loading={busy}>{label}</Button></Footer>
    </form>
  );
}

function AssignForm({ busy, onSubmit, currentId }: { busy: boolean; onSubmit: (b: unknown) => void; currentId: string | null }) {
  const { me } = useSession();
  const canList = can(me.roles, 'dispute:view_all');
  const { data, error, loading } = useApi<unknown>(canList ? adminPath('staff') : null);
  const staff = useMemo(() => normalizeStaff(data).filter((s) => s.roles.some((r) => r === 'DISPUTE_MANAGER' || r === 'SUPPORT_AGENT')), [data]);
  const [assignee, setAssignee] = useState(me.id);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ assigneeId: assignee }); }} className="space-y-3">
      <Field label="Attribuer à" hint={error ? 'Liste du personnel indisponible : seule l’auto-attribution est proposée.' : undefined}>
        {(p) => (
          <Select {...p} value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={loading}>
            <option value={me.id}>Moi-même ({me.displayName})</option>
            {staff.filter((s) => s.id !== me.id).map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.email ? ` — ${s.email}` : ''}{s.id === currentId ? ' (actuel)' : ''}</option>
            ))}
          </Select>
        )}
      </Field>
      <Footer><Button type="submit" variant="primary" loading={busy} disabled={assignee === currentId}>Attribuer</Button></Footer>
    </form>
  );
}

function EvidenceForm({ busy, onSubmit }: { busy: boolean; onSubmit: (b: unknown) => void }) {
  const [from, setFrom] = useState<'PASSENGER' | 'DRIVER' | 'BOTH'>('BOTH');
  const [message, setMessage] = useState('');
  const [hours, setHours] = useState('48');
  const parsed = RequestEvidenceInput.safeParse({ from, message: message.trim(), dueInHours: Number(hours) });
  const msgErr = message.length > 0 && message.trim().length < 10 ? 'Au moins 10 caractères.' : null;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (parsed.success) onSubmit(parsed.data); }} className="space-y-4">
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium">Destinataire(s)</legend>
        <div className="inline-flex rounded-lg border border-line-strong p-0.5">
          {([['PASSENGER', 'Passager'], ['DRIVER', 'Conducteur'], ['BOTH', 'Les deux']] as const).map(([v, l]) => (
            <label key={v} className={cn('cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-strong', from === v ? 'bg-night text-white' : 'text-ink hover:bg-muted')}>
              <input type="radio" name="from" value={v} checked={from === v} onChange={() => setFrom(v)} className="sr-only" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Message aux parties" required error={msgErr} hint="Ton neutre et factuel. 10 à 1000 caractères.">
        {(p) => <Textarea {...p} value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} placeholder="Merci de transmettre tout élément permettant d’établir l’heure d’arrivée au point de rendez-vous." />}
      </Field>
      <Field label="Délai de réponse (heures)" hint="Entre 12 h et 168 h (7 jours).">
        {(p) => <Input {...p} type="number" min={12} max={168} step={1} value={hours} onChange={(e) => setHours(e.target.value)} className="w-32" />}
      </Field>
      <Footer><Button type="submit" variant="primary" loading={busy} disabled={!parsed.success}>Envoyer la demande</Button></Footer>
    </form>
  );
}

function ProposeForm({ busy, onSubmit, dispute }: { busy: boolean; onSubmit: (b: unknown) => void; dispute: DisputeDetail }) {
  const [refund, setRefund] = useState('');
  const [release, setRelease] = useState('');
  const [reason, setReason] = useState('');
  const [sensitive, setSensitive] = useState(dispute.priority === 'SAFETY');
  const preview = previewSplit(dispute.funds, refund, release);
  const reasonErr = reason.length > 0 && reason.trim().length < 20 ? `Motivation trop courte (${reason.trim().length}/20 caractères minimum).` : null;
  const parsed = preview.ok
    ? DisputeDecisionInput.safeParse({ refundToPassenger: preview.breakdown.refundToPassenger, releaseToDriver: preview.breakdown.releaseToDriver, reason: reason.trim(), sensitive })
    : null;
  const ready = Boolean(parsed?.success);

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (parsed?.success) onSubmit(parsed.data); }} className="space-y-4">
      {dispute.funds ? (
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-ivory p-3 text-[12.5px] ring-1 ring-line">
          <div><p className="text-ink">Encaissé</p><p className="tnum font-semibold">{fcfa(dispute.funds.captured)}</p></div>
          <div><p className="text-ink">Part conducteur</p><p className="tnum font-semibold">{fcfa(dispute.funds.driverAmount)}</p></div>
          <div><p className="text-ink">Frais de service</p><p className="tnum font-semibold">{fcfa(dispute.funds.serviceFee)}</p></div>
        </div>
      ) : <Notice tone="amber">Position financière absente de la réponse : l’aperçu est indisponible, le serveur validera seul.</Notice>}

      {dispute.funds ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Pré-remplissages">
          {presets(dispute.funds).map((p) => (
            <button key={p.label} type="button" className="rounded-md border border-line-strong px-2 py-1 text-[12px] text-ink hover:bg-muted" onClick={() => { setRefund(String(p.refund)); setRelease(String(p.release)); }}>
              {p.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Remboursement au passager (FCFA)" required>
          {(p) => <Input {...p} inputMode="numeric" value={refund} onChange={(e) => setRefund(e.target.value)} placeholder="0" className="tnum" />}
        </Field>
        <Field label="Versement au conducteur (FCFA)" required>
          {(p) => <Input {...p} inputMode="numeric" value={release} onChange={(e) => setRelease(e.target.value)} placeholder="0" className="tnum" />}
        </Field>
      </div>

      <div aria-live="polite" className={cn('rounded-lg border p-3', preview.ok ? 'border-brand/30 bg-brand-soft/50' : 'border-line bg-muted')}>
        <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink">
          {preview.ok ? <CheckCircle2 aria-hidden className="size-3.5 text-brand-strong" /> : <AlertTriangle aria-hidden className="size-3.5 text-amber-ink" />}
          Aperçu de la répartition (indicatif — validé par le serveur)
        </p>
        {preview.ok ? (
          <dl className="space-y-1 text-[13px]">
            {preview.rows.map((r) => (
              <div key={r.label} className="flex justify-between gap-3">
                <dt className={r.emphasis ? 'font-medium' : 'pl-2 text-ink'}>{r.label}</dt>
                <dd className={cn('tnum', r.emphasis && 'font-semibold')}>{r.value}</dd>
              </div>
            ))}
          </dl>
        ) : <p className="text-[13px] text-text">{preview.error}</p>}
      </div>

      <Field label="Motivation de la décision" required error={reasonErr} hint="Faits retenus, éléments des deux parties, règle appliquée. 20 à 2000 caractères. Communiquée aux parties.">
        {(p) => <Textarea {...p} value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} className="min-h-28" />}
      </Field>

      <label className="flex items-start gap-2.5 text-[13px]">
        <input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} className="mt-0.5 size-4 accent-[#0B7A70]" />
        <span><span className="font-medium">Cas sensible</span> — sécurité, montant inhabituel ou dérogation. Exige une approbation renforcée.</span>
      </label>

      <Notice tone="blue">Toute décision financière est soumise à l’approbation d’une <strong>autre personne</strong> habilitée avant toute instruction au PSP.</Notice>
      <Footer><Button type="submit" variant="primary" loading={busy} disabled={!ready}>Soumettre pour approbation</Button></Footer>
    </form>
  );
}

function ApproveForm({ busy, onSubmit, dispute }: { busy: boolean; onSubmit: () => void; dispute: DisputeDetail }) {
  const dec = dispute.decision;
  const [ack, setAck] = useState(false);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-3">
      {dec ? (
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-ivory p-3 ring-1 ring-line">
          <div><dt className="text-[12px] text-ink">Remboursement passager</dt><dd className="tnum text-lg font-bold">{fcfa(dec.refundToPassenger)}</dd></div>
          <div><dt className="text-[12px] text-ink">Versement conducteur</dt><dd className="tnum text-lg font-bold">{fcfa(dec.releaseToDriver)}</dd></div>
          <div className="col-span-2"><dt className="text-[12px] text-ink">Motivation</dt><dd className="mt-0.5 whitespace-pre-wrap text-[13px]">{dec.reason}</dd></div>
        </dl>
      ) : null}
      <label className="flex items-start gap-2.5 text-[13px]">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 size-4 accent-[#0B7A70]" />
        J’ai relu les éléments des deux parties et j’approuve cette décision en tant que seconde personne.
      </label>
      <Notice tone="neutral">L’approbation produit une instruction au partenaire PSP. Son exécution (remboursement / versement) sera confirmée séparément par le PSP.</Notice>
      <Footer><Button type="submit" variant="primary" loading={busy} disabled={!ack}>Approuver</Button></Footer>
    </form>
  );
}

function RejectForm({ busy, onSubmit }: { busy: boolean; onSubmit: (b: unknown) => void }) {
  const [reason, setReason] = useState('');
  const parsed = RejectDecisionInput.safeParse({ reason: reason.trim() });
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (parsed.success) onSubmit(parsed.data); }} className="space-y-3">
      <Field label="Motif du rejet" required hint="10 à 1000 caractères. Le dossier repasse en instruction." error={reason.length > 0 && !parsed.success ? 'Au moins 10 caractères.' : null}>
        {(p) => <Textarea {...p} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />}
      </Field>
      <Footer><Button type="submit" variant="danger" loading={busy} disabled={!parsed.success}>Rejeter la proposition</Button></Footer>
    </form>
  );
}

function TriageForm({ busy, onSubmit, current }: { busy: boolean; onSubmit: (b: unknown) => void; current: Priority }) {
  const [priority, setPriority] = useState<Priority>(current);
  const body = priority === current ? {} : { priority };
  const parsed = TriageInput.safeParse(body);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (parsed.success) onSubmit(parsed.data); }} className="space-y-3">
      <p className="text-sm">Qualifiez le dossier. Il pourra ensuite passer en instruction ou faire l’objet d’une demande de pièces.</p>
      <Field label="Priorité" hint="« Sécurité » place le dossier en tête de file et affiche les consignes d’urgence.">
        {(p) => (
          <Select {...p} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {(['SAFETY', 'HIGH', 'NORMAL'] as const).map((k) => <option key={k} value={k}>{PRIORITY_LABEL[k]}{k === current ? ' (actuelle)' : ''}</option>)}
          </Select>
        )}
      </Field>
      <Footer><Button type="submit" variant="primary" loading={busy}>Confirmer le tri</Button></Footer>
    </form>
  );
}

function CloseForm({ busy, onSubmit }: { busy: boolean; onSubmit: (b: unknown) => void }) {
  const [reason, setReason] = useState('');
  const body = reason.trim() ? { reason: reason.trim() } : {};
  const parsed = CloseDisputeInput.safeParse(body);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (parsed.success) onSubmit(parsed.data); }} className="space-y-3">
      <p className="text-sm">Le dossier résolu sera clôturé. Le recours interne n’est plus possible après clôture.</p>
      <Field label="Note de clôture (facultative)" hint="5 à 500 caractères si renseignée." error={reason.trim() && !parsed.success ? 'Au moins 5 caractères.' : null}>
        {(p) => <Textarea {...p} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} className="min-h-20" />}
      </Field>
      <Footer><Button type="submit" variant="danger" loading={busy} disabled={!parsed.success}>Clôturer définitivement</Button></Footer>
    </form>
  );
}
