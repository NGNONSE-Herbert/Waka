import { describe, expect, it } from 'vitest';
import { previewSplit, parseFcfaInput } from '../src/lib/split';
import { can, canSee, disputeActionGates, type DisputeGateContext } from '../src/lib/permissions';
import { toCsv } from '../src/lib/csv';
import { fcfa, maskPlate, sla, expiry } from '../src/lib/format';
import { normalizeDisputeListItem, sortDisputes, normalizeMe } from '../src/lib/models';

const pos = { captured: 11_000, driverAmount: 10_000, serviceFee: 1_000, refunded: 0, released: 0 };

describe('aperçu de répartition (validateAllocation)', () => {
  it('remboursement intégral : prélève part conducteur puis frais', () => {
    const r = previewSplit(pos, '11 000', '0');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.breakdown.refundFromDriverShare).toBe(10_000);
      expect(r.breakdown.refundFromFee).toBe(1_000);
      expect(r.breakdown.feeRetained).toBe(0);
      expect(r.rows[0]?.value).toBe(fcfa(11_000));
    }
  });
  it('partage : 4 000 remboursés / 6 000 versés, frais conservés', () => {
    const r = previewSplit(pos, '4000', '6000');
    expect(r.ok && r.breakdown.feeRetained).toBe(1_000);
  });
  it('refuse que la plateforme garde une part conducteur', () => {
    const r = previewSplit(pos, '1000', '6000');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/part conducteur non versée/);
  });
  it('refuse un versement supérieur à la part conducteur', () => {
    const r = previewSplit(pos, '0', '10500');
    expect(r.ok).toBe(false);
  });
  it('refuse les saisies non entières', () => {
    expect(parseFcfaInput('12,5')).toBeNaN();
    expect(previewSplit(pos, '12.5', '0').ok).toBe(false);
    expect(previewSplit(pos, '', '0').ok).toBe(false);
  });
  it('refuse une allocation déjà engagée', () => {
    const r = previewSplit({ ...pos, refunded: 500 }, '11000', '0');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/déjà été engagé/);
  });
});

const base: DisputeGateContext = { roles: ['DISPUTE_MANAGER'], userId: 'u1', mfaVerified: true, state: 'UNDER_REVIEW', assigneeId: 'u1', decision: null };

describe('masquage des actions selon rôle et état', () => {
  it('SUPPORT_AGENT ne voit ni proposer ni approuver', () => {
    const g = disputeActionGates({ ...base, roles: ['SUPPORT_AGENT'] });
    expect(g.propose.visible).toBe(false);
    const g2 = disputeActionGates({ ...base, roles: ['SUPPORT_AGENT'], state: 'DECISION_PROPOSED', decision: { state: 'PROPOSED', proposedById: 'x' } });
    expect(g2.approve.visible).toBe(false);
    expect(g2.reject.visible).toBe(false);
  });
  it('le proposant ne peut pas approuver (séparation des tâches)', () => {
    const g = disputeActionGates({ ...base, state: 'DECISION_PROPOSED', decision: { state: 'PROPOSED', proposedById: 'u1' } });
    expect(g.approve.visible).toBe(true);
    expect(g.approve.enabled).toBe(false);
    expect(g.approve.reason).toMatch(/Séparation des tâches/);
  });
  it('un second gestionnaire peut approuver', () => {
    const g = disputeActionGates({ ...base, userId: 'u2', state: 'DECISION_PROPOSED', decision: { state: 'PROPOSED', proposedById: 'u1' } });
    expect(g.approve.enabled).toBe(true);
  });
  it('MFA absente : action sensible désactivée', () => {
    const g = disputeActionGates({ ...base, mfaVerified: false });
    expect(g.propose.visible).toBe(true);
    expect(g.propose.enabled).toBe(false);
  });
  it('les actions suivent la machine d’états', () => {
    const g = disputeActionGates({ ...base, state: 'OPENED' });
    expect(g.triage.visible).toBe(true);
    expect(g.propose.visible).toBe(false);
    expect(disputeActionGates({ ...base, state: 'RESOLVED' }).close.visible).toBe(true);
    const proposed = disputeActionGates({ ...base, userId: 'u2', state: 'DECISION_PROPOSED', decision: { state: 'PROPOSED', proposedById: 'u1' } });
    expect(proposed.startReview.visible).toBe(false);
    expect(proposed.propose.visible).toBe(false);
    expect(disputeActionGates({ ...base, state: 'APPEALED' }).startReview.visible).toBe(true);
  });
  it('écrans : SUPERADMIN n’a aucun accès finance implicite', () => {
    expect(canSee(['SUPERADMIN'], 'finance')).toBe(false);
    expect(canSee(['FINANCE'], 'finance')).toBe(true);
    expect(can(['FINANCE'], 'finance:reconcile')).toBe(true);
    expect(can(['DISPUTE_MANAGER'], 'finance:reconcile')).toBe(false);
  });
});

describe('utilitaires', () => {
  it('CSV : échappe et neutralise les formules', () => {
    const csv = toCsv(['a', 'b'], [['=SUM(A1)', 'x;y'], [-500, null]]);
    expect(csv).toBe('a;b\r\n\'=SUM(A1);"x;y"\r\n-500;');
  });
  it('formats', () => {
    expect(fcfa(5500)).toMatch(/^5\s500 FCFA$/);
    expect(fcfa(null)).toBe('—');
    expect(maskPlate('LT 123 AB')).toBe('LT •••• AB');
    const now = new Date('2026-11-21T10:00:00Z');
    expect(sla('2026-11-21T08:00:00Z', now).tone).toBe('overdue');
    expect(sla('2026-11-21T15:00:00Z', now).tone).toBe('soon');
    expect(expiry('2026-11-01', now).tone).toBe('expired');
    expect(expiry('2026-12-10', now).tone).toBe('soon');
  });
  it('tri des litiges : SÉCURITÉ d’abord puis échéance', () => {
    const items = [
      { id: 'a', priority: 'NORMAL', dueAt: '2026-11-21T09:00:00Z' },
      { id: 'b', priority: 'SAFETY', dueAt: '2026-11-25T09:00:00Z' },
      { id: 'c', priority: 'HIGH', dueAt: null },
      { id: 'd', priority: 'HIGH', dueAt: '2026-11-22T09:00:00Z' },
    ].map((x) => normalizeDisputeListItem(x)!);
    expect(sortDisputes(items).map((d) => d.id)).toEqual(['b', 'd', 'c', 'a']);
  });
  it('session : lecture tolérante', () => {
    const me = normalizeMe({ staff: { id: 's1', email: 'litiges@waka.test', roles: ['DISPUTE_MANAGER', 'NOPE'] }, mfaVerified: true });
    expect(me?.roles).toEqual(['DISPUTE_MANAGER']);
    expect(me?.mfaVerified).toBe(true);
  });
});
