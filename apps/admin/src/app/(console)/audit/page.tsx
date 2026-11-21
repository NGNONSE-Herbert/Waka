'use client';

import { useMemo, useState } from 'react';
import { Link2, Link2Off, ScrollText, ShieldCheck } from 'lucide-react';
import { useApi } from '@/lib/use-api';
import { normalizeStaff } from '@/lib/models';
import { adminPath } from '@/lib/api';
import { bool, isObj, list, num, obj, personName, str } from '@/lib/normalize';
import { dateTimeFull, shortId } from '@/lib/format';
import { RequireScreen } from '@/components/session';
import { Badge, Card, CardHeader, EmptyState, ErrorState, Input, LoadingBlock, Notice, PageHeader, TableWrap, cn, td, th, tr } from '@/components/ui';

interface AuditRow {
  id: string;
  at: string | null;
  actor: string;
  actorId: string | null;
  actorType: string | null;
  action: string;
  entity: string;
  reason: string | null;
  ip: string | null;
  requestId: string | null;
  hash: string | null;
  prevHash: string | null;
}

function normalize(raw: unknown): { rows: AuditRow[]; chainVerified: boolean | null; chainDetail: string | null; chainCount: number | null } {
  const rows = list(raw, 'entries', 'logs').map((e, i) => {
    const actorObj = isObj(e) ? e.actor : null;
    const type = str(e, 'entityType', 'entity.type');
    const eid = str(e, 'entityId', 'entity.id');
    return {
      id: str(e, 'id') ?? String(i),
      at: str(e, 'at', 'createdAt'),
      actor: personName(actorObj) ?? str(e, 'actorEmail', 'actorName') ?? (str(e, 'actorId') ? `#${shortId(str(e, 'actorId'))}` : str(e, 'actorType') === 'SYSTEM' ? 'Système' : '—'),
      actorId: str(e, 'actorId', 'actor.id'),
      actorType: str(e, 'actorType', 'actor.type'),
      action: str(e, 'action') ?? '—',
      entity: type ? `${type}${eid ? ` #${shortId(eid)}` : ''}` : '—',
      reason: str(e, 'reason'),
      ip: str(e, 'ip'),
      requestId: str(e, 'requestId'),
      hash: str(e, 'hash'),
      prevHash: str(e, 'prevHash'),
    };
  });
  const chain = obj(raw, 'chain', 'integrity');
  const verified = bool(raw, 'chainVerified', 'verified') ?? bool(chain, 'verified', 'valid', 'ok');
  const brokenAt = str(chain, 'brokenAt');
  return { rows, chainVerified: verified, chainDetail: brokenAt ? `rupture à l’entrée n° ${brokenAt}` : str(chain, 'message', 'detail'), chainCount: num(chain, 'count') };
}

export default function AuditPage() {
  return <RequireScreen screen="audit"><AuditInner /></RequireScreen>;
}

function AuditInner() {
  const { data, error, loading, reload } = useApi<unknown>(adminPath('audit'));
  const staff = useApi<unknown>(adminPath('staff'));
  const names = useMemo(() => new Map(normalizeStaff(staff.data).map((s) => [s.id, s.name])), [staff.data]);
  const { rows: rawRows, chainVerified, chainDetail, chainCount } = useMemo(() => normalize(data), [data]);
  // L'API ne renvoie que actorId : on résout les noms du personnel (les usagers restent pseudonymisés).
  const rows = useMemo(() => rawRows.map((r) => ({ ...r, actor: r.actorId && names.has(r.actorId) ? names.get(r.actorId)! : r.actor })), [rawRows, names]);
  const [q, setQ] = useState('');
  const shown = rows.filter((r) => !q || `${r.actor} ${r.action} ${r.entity} ${r.reason ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  // Vérification locale de continuité : chaque prevHash doit égaler le hash de l'entrée précédente (ordre chronologique).
  const localLinks = useMemo(() => {
    const asc = [...rows].sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
    const ok = new Set<string>();
    asc.forEach((r, i) => { const prev = asc[i - 1]; if (prev && r.prevHash && prev.hash === r.prevHash) ok.add(r.id); });
    return ok;
  }, [rows]);

  return (
    <>
      <PageHeader
        eyebrow="Conformité"
        title="Journal d’audit"
        description="Journal immuable : chaque entrée référence l’empreinte de la précédente (chaîne de hachage). Aucune modification ni suppression possible."
        actions={
          chainVerified === true ? <Badge tone="green" icon={<ShieldCheck aria-hidden className="size-3" />}>Chaîne vérifiée par le serveur{chainCount !== null ? ` · ${chainCount} entrées` : ''}</Badge>
            : chainVerified === false ? <Badge tone="red" icon={<Link2Off aria-hidden className="size-3" />}>Chaîne rompue{chainDetail ? ` — ${chainDetail}` : ''}</Badge>
            : <Badge>Vérification serveur non fournie</Badge>
        }
      />
      {chainVerified === false ? <div className="mb-4"><Notice tone="red" title="Intégrité compromise">Une rupture de chaîne indique une altération possible du journal. Escalade sécurité immédiate.</Notice></div> : null}
      <Card>
        <CardHeader
          title={<>Entrées <span className="tnum text-ink">({shown.length})</span></>}
          subtitle="Les plus récentes en premier. Heure de Douala."
          actions={<><label htmlFor="audit-q" className="sr-only">Rechercher</label><Input id="audit-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer : acteur, action, entité…" className="h-9 w-64" /></>}
        />
        {error ? <ErrorState error={error} onRetry={reload} /> : null}
        {loading && data === undefined ? <LoadingBlock rows={8} /> : null}
        {!loading && !error && shown.length === 0 ? <EmptyState title="Aucune entrée" icon={<ScrollText className="size-5" />} /> : null}
        {shown.length ? (
          <TableWrap label="Journal d’audit">
            <table className="data-table w-full min-w-[1040px]">
              <thead>
                <tr>
                  <th scope="col" className={th}>Horodatage</th>
                  <th scope="col" className={th}>Acteur</th>
                  <th scope="col" className={th}>Action</th>
                  <th scope="col" className={th}>Entité</th>
                  <th scope="col" className={th}>Motif</th>
                  <th scope="col" className={th}>IP</th>
                  <th scope="col" className={th}>Empreinte</th>
                </tr>
              </thead>
              <tbody>
                {[...shown].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')).map((r) => (
                  <tr key={r.id} className={tr}>
                    <td className={cn(td, 'tnum text-ink')}>{dateTimeFull(r.at)}</td>
                    <td className={td}>{r.actor}{r.actorType ? <span className="ml-1 text-[11px] text-ink-soft">{r.actorType}</span> : null}</td>
                    <td className={cn(td, 'font-mono text-[12px]')}>{r.action}</td>
                    <td className={cn(td, 'font-mono text-[12px] text-ink')}>{r.entity}</td>
                    <td className={cn(td, 'max-w-[280px] truncate')} title={r.reason ?? undefined}>{r.reason ?? <span className="text-ink-soft">—</span>}</td>
                    <td className={cn(td, 'font-mono text-[12px] text-ink')}>{r.ip ?? '—'}</td>
                    <td className={td}>
                      <span className="inline-flex items-center gap-1 font-mono text-[12px]" title={r.hash ? `hash ${r.hash}\nprev ${r.prevHash ?? '—'}` : undefined}>
                        {localLinks.has(r.id) ? <Link2 aria-label="Lien vérifié avec l’entrée précédente" className="size-3.5 text-brand-strong" /> : <span aria-hidden className="inline-block size-3.5" />}
                        {r.hash ? r.hash.slice(0, 10) : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : null}
      </Card>
    </>
  );
}
