'use client';

import { FileText, Lock, Scale } from 'lucide-react';
import { DEFAULT_FEE_POLICY, DEFAULT_NO_RESPONSE_POLICY } from '@waka/domain';
import { useApi } from '@/lib/use-api';
import { adminPath } from '@/lib/api';
import { arr, bool, num, obj, str } from '@/lib/normalize';
import { fcfa } from '@/lib/format';
import { RequireScreen } from '@/components/session';
import { Badge, Card, CardHeader, ErrorState, KeyValue, LoadingBlock, Notice, PageHeader, TableWrap, cn, td, th } from '@/components/ui';

const CAP_LABEL: Record<string, string> = {
  conditionalHold: 'Retenue conditionnelle',
  marketplacePayouts: 'Versements à des tiers',
  partialRefund: 'Remboursement partiel',
  fullRefund: 'Remboursement intégral',
  signedWebhooks: 'Webhooks signés',
  statusQueryApi: 'API de statut',
  reconciliationReport: 'Relevé de rapprochement',
  channels: 'Canaux',
};

export default function PoliciesPage() {
  return <RequireScreen screen="policies"><PoliciesInner /></RequireScreen>;
}

function PoliciesInner() {
  const { data, error, loading, reload } = useApi<unknown>(adminPath('policies'));
  const fee = obj(data, 'feePolicy', 'fee', 'fees');
  const noResp = obj(data, 'noResponsePolicy', 'noResponse');
  const provider = obj(data, 'paymentProvider');
  const caps = obj(provider, 'capabilities');
  const cancel = obj(data, 'cancellation', 'cancellationPolicy');
  const cancelRows = arr(cancel ?? data, 'matrix', 'rules', 'rows', 'cancellationMatrix');

  return (
    <>
      <PageHeader
        eyebrow="Gouvernance"
        title="Politiques en vigueur"
        description="Affichage en lecture seule. Toute réservation conserve le snapshot de la politique applicable au moment de l’achat."
        actions={<Badge icon={<Lock aria-hidden className="size-3" />}>Lecture seule</Badge>}
      />
      {error ? <Card className="mb-4"><ErrorState error={error} onRetry={reload} /></Card> : null}
      {loading && data === undefined ? <Card><LoadingBlock /></Card> : null}
      {data !== undefined || error ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title="Politique de frais de service" subtitle={fee ? undefined : 'Non fournie par l’API — valeurs par défaut du code affichées pour référence.'} actions={<Badge tone="night">{str(fee, 'version') ?? DEFAULT_FEE_POLICY.version}</Badge>} />
            <div className="p-4">
              <KeyValue
                items={[
                  { k: 'Frais fixes par place', v: fcfa(num(fee, 'serviceFeePerSeat') ?? DEFAULT_FEE_POLICY.serviceFeePerSeat) },
                  { k: 'Part proportionnelle', v: `${((num(fee, 'serviceFeeRateBp') ?? DEFAULT_FEE_POLICY.serviceFeeRateBp) / 100).toLocaleString('fr-FR')} %` },
                  { k: 'Frais min / max par place', v: `${fcfa(num(fee, 'minFeePerSeat') ?? DEFAULT_FEE_POLICY.minFeePerSeat)} – ${fcfa(num(fee, 'maxFeePerSeat') ?? DEFAULT_FEE_POLICY.maxFeePerSeat)}` },
                  { k: 'Contribution par place', v: `${fcfa(num(fee, 'minSeatPrice') ?? DEFAULT_FEE_POLICY.minSeatPrice)} – ${fcfa(num(fee, 'maxSeatPrice') ?? DEFAULT_FEE_POLICY.maxSeatPrice)}` },
                  { k: 'Places max par réservation', v: String(num(fee, 'maxSeatsPerBooking') ?? DEFAULT_FEE_POLICY.maxSeatsPerBooking) },
                  { k: 'Statut', v: <Badge tone="amber">Exemple non contractuel</Badge> },
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Non-réponse du passager" subtitle={noResp ? undefined : 'Non fournie par l’API — valeurs par défaut du code.'} actions={<Badge tone="night">{str(noResp, 'version') ?? DEFAULT_NO_RESPONSE_POLICY.version}</Badge>} />
            <NoResponse noResp={noResp} />
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader title="Paramètres de la plateforme" subtitle="Valeurs renvoyées par l’API." />
            <div className="space-y-4 p-4">
              <KeyValue
                cols={3}
                items={[
                  { k: 'Version des CGU', v: str(data, 'termsVersion') ?? '—' },
                  { k: 'Rétention de place (hold)', v: num(data, 'holdTtlSeconds') !== null ? `${Math.round(num(data, 'holdTtlSeconds')! / 60)} min` : '—' },
                  { k: 'Version du matching', v: str(data, 'matchingVersion') ?? '—' },
                  { k: 'Seuil de double approbation', v: num(data, 'doubleApprovalThresholdXaf') !== null ? (num(data, 'doubleApprovalThresholdXaf') === 0 ? 'Toute décision financière (0 FCFA)' : fcfa(num(data, 'doubleApprovalThresholdXaf'))) : '—' },
                  { k: 'Prestataire de paiement', v: provider ? <>{str(provider, 'id') ?? '—'} <Badge tone="amber">{str(provider, 'mode') ?? '—'}</Badge></> : '—' },
                ]}
              />
              {caps ? (
                <div>
                  <p className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-ink-soft">Capacités déclarées par l’adaptateur PSP</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {Object.entries(caps).map(([k, v]) => (
                      <li key={k}><Badge tone={v === true ? 'green' : v === false ? 'neutral' : 'blue'}>{CAP_LABEL[k] ?? k}{typeof v === 'boolean' ? (v ? ' : oui' : ' : non') : Array.isArray(v) ? ` : ${v.join(', ')}` : ''}</Badge></li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader title="Matrice d’annulation" subtitle="Remboursements selon l’auteur et le délai avant départ." actions={<Badge tone="amber" icon={<Scale aria-hidden className="size-3" />}>À valider juridiquement</Badge>} />
            {cancelRows.length ? (
              <TableWrap label="Matrice d’annulation">
                <table className="w-full min-w-[640px]">
                  <thead className="bg-muted">
                    <tr><th scope="col" className={th}>Cas</th><th scope="col" className={th}>Délai</th><th scope="col" className={th}>Passager</th><th scope="col" className={th}>Conducteur</th><th scope="col" className={th}>Frais</th></tr>
                  </thead>
                  <tbody>
                    {cancelRows.map((r, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className={cn(td, 'whitespace-normal! min-w-[14rem] font-medium')}>{str(r, 'case', 'label', 'actor', 'who') ?? '—'}</td>
                        <td className={td}>{str(r, 'window', 'delay', 'timing', 'when') ?? '—'}</td>
                        <td className={cn(td, 'whitespace-normal! min-w-[10rem]')}>{str(r, 'passenger', 'passengerRefund', 'refund') ?? '—'}</td>
                        <td className={cn(td, 'whitespace-normal! min-w-[10rem]')}>{str(r, 'driver', 'driverPayout', 'driverOutcome') ?? '—'}</td>
                        <td className={cn(td, 'whitespace-normal! min-w-[10rem]')}>{str(r, 'fee', 'feeOutcome', 'serviceFee') ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            ) : (
              <div className="p-4"><Notice tone="neutral" icon={<FileText className="size-4" />}>Matrice non fournie par l’API. Elle sera publiée après validation par le conseil juridique et le PSP.</Notice></div>
            )}
            <div className="border-t border-line p-4">
              <Notice tone="amber">Ces règles sont des propositions produit. Elles ne sont pas opposables tant qu’elles n’ont pas été validées juridiquement et intégrées aux CGU versionnées.</Notice>
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}

function NoResponse({ noResp }: { noResp: ReturnType<typeof obj> }) {
  const enabled = bool(noResp, 'autoReleaseEnabled') ?? DEFAULT_NO_RESPONSE_POLICY.autoReleaseEnabled;
  const ref = str(noResp, 'legallyValidatedRef') ?? DEFAULT_NO_RESPONSE_POLICY.legallyValidatedRef;
  const hours = num(noResp, 'windowHours') ?? DEFAULT_NO_RESPONSE_POLICY.windowHours;
  const effective = enabled && Boolean(ref);
  return (
    <div className="space-y-3 p-4">
      <KeyValue
        items={[
          { k: 'Libération automatique', v: effective ? <Badge tone="green">Activée</Badge> : <Badge tone="red">Désactivée</Badge> },
          { k: 'Fenêtre après arrivée signalée', v: `${hours} h` },
          { k: 'Référence de validation juridique', v: ref ?? <span className="text-ink">Aucune</span> },
          { k: 'Issue à expiration', v: effective ? 'Libération possible' : 'Vérification manuelle (MANUAL_REVIEW)' },
        ]}
      />
      {!effective ? (
        <Notice tone="blue">
          Libération automatique désactivée jusqu’à validation juridique (référence requise). Sans confirmation explicite du passager, le dossier passe en vérification manuelle — le signalement « arrivé » du conducteur ne suffit jamais.
        </Notice>
      ) : null}
    </div>
  );
}
