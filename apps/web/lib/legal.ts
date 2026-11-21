import type { Locale } from './i18n/config';
import { frTypo } from './i18n/typo';

/**
 * Textes légaux / informatifs — PROJETS à valider par un juriste. Volontairement concis et honnêtes :
 * aucune promesse de séquestre par Waka, aucune garantie non contractualisée.
 */
export type LegalDoc = { title: string; intro: string; sections: { h: string; p: string[] }[] };
type Slug = 'cgu' | 'confidentialite' | 'paiement-protege' | 'securite';

const FR: Record<Slug, LegalDoc> = {
  cgu: {
    title: 'Conditions générales d\'utilisation',
    intro: 'Version cgu-2026-11-v1. Waka est une plateforme de mise en relation entre conducteurs particuliers et passagers pour des trajets interurbains partagés au Cameroun.',
    sections: [
      { h: '1. Objet', p: ['Waka met en relation des conducteurs particuliers et des passagers souhaitant partager les frais d\'un trajet. Waka n\'est pas un transporteur et n\'exploite aucun véhicule.'] },
      { h: '2. Covoiturage privé, sans but lucratif', p: ['Le conducteur déclare pratiquer un covoiturage privé : la contribution demandée couvre une partie des frais du trajet (carburant, péage, usure) et ne constitue pas une rémunération.', 'Toute activité de transport public de personnes à titre onéreux est interdite sur la plateforme.'] },
      { h: '3. Prix, frais et transparence', p: ['Le prix affiché au passager est un total par place, frais de service inclus. Il se décompose en une contribution destinée au conducteur et des frais de service Waka, selon une grille tarifaire versionnée communiquée avant tout paiement.'] },
      { h: '4. Paiement', p: ['Les paiements sont encaissés et conservés par un prestataire de services de paiement agréé (PSP), et non par Waka. La contribution n\'est versée au conducteur qu\'après confirmation de l\'arrivée par le passager, ou à l\'issue de la procédure de litige.', 'Le PSP partenaire est en cours de contractualisation : en démonstration, les paiements sont simulés.'] },
      { h: '5. Annulation', p: ['Les conditions d\'annulation sont résumées sur chaque trajet avant réservation. Un remboursement n\'est effectif qu\'une fois confirmé par le PSP.'] },
      { h: '6. Litiges', p: ['Chaque partie peut ouvrir un dossier lié à une réservation. Pendant l\'examen, le règlement est suspendu chez le PSP. L\'équipe Waka arbitre au sens contractuel, sur la base des éléments des deux parties ; la décision est motivée et peut faire l\'objet d\'un recours interne. Waka n\'est pas une autorité judiciaire : les voies de recours légales restent ouvertes.'] },
      { h: '7. Comportement et sécurité', p: ['Respect, ponctualité et sécurité routière sont attendus de tous. Tout comportement dangereux peut entraîner la suspension du compte.'] },
    ],
  },
  confidentialite: {
    title: 'Politique de confidentialité',
    intro: 'Nous collectons le minimum de données nécessaires au service, et ne les vendons jamais.',
    sections: [
      { h: 'Données collectées', p: ['Numéro de téléphone (connexion par code SMS), nom affiché, réservations et trajets, échanges liés aux litiges. Pour les conducteurs : informations de permis, de pièce d\'identité et de véhicule, conservées dans un stockage privé.'] },
      { h: 'Finalités', p: ['Fournir le service de mise en relation, sécuriser les paiements avec le PSP, prévenir la fraude, traiter les litiges et respecter nos obligations légales.'] },
      { h: 'Partage', p: ['Votre numéro n\'est jamais affiché en entier aux autres membres. Les données de paiement sont traitées par le PSP. Aucune donnée n\'est vendue à des tiers.'] },
      { h: 'Vos droits', p: ['Vous pouvez demander l\'accès, la rectification ou la suppression de vos données auprès de l\'assistance, dans les limites des obligations de conservation (comptabilité, litiges).'] },
      { h: 'Conservation', p: ['Durées de conservation à définir avec le conseil juridique et selon la réglementation camerounaise applicable.'] },
    ],
  },
  'paiement-protege': {
    title: 'Le paiement protégé, expliqué simplement',
    intro: 'Waka ne détient pas votre argent. Les fonds sont encaissés et conservés par un prestataire de services de paiement agréé, sous conditions, jusqu\'à la fin du trajet.',
    sections: [
      { h: '1. Vous payez via mobile money', p: ['Vous choisissez MTN Mobile Money ou Orange Money et validez la demande sur votre téléphone. Waka ne vous demandera jamais votre code secret.'] },
      { h: '2. Le partenaire confirme', p: ['Votre réservation n\'est confirmée qu\'après confirmation du paiement par le partenaire, vérifiée par notre serveur. Tant que ce n\'est pas le cas, l\'écran indique « Paiement en cours de vérification ».'] },
      { h: '3. Les fonds sont conservés par le partenaire', p: ['Pendant le trajet, le statut est « Fonds gérés par notre partenaire de paiement ». Ni le conducteur ni Waka ne peuvent en disposer librement.'] },
      { h: '4. Vous confirmez l\'arrivée', p: ['Une fois arrivé, vous confirmez dans l\'application. Le versement est alors demandé au partenaire (« Versement demandé »), puis confirmé par lui (« Versement confirmé »). Ces deux états sont toujours distingués.'] },
      { h: '5. En cas de problème', p: ['Vous signalez un problème avant de confirmer : le règlement est suspendu (« Litige en cours : règlement suspendu »). Après examen contradictoire, la décision (remboursement, versement ou partage) est exécutée par le partenaire, qui en apporte la preuve.'] },
      { h: 'Statut actuel', p: ['Le contrat avec un PSP agréé est en cours. Cette démonstration fonctionne en mode simulé (MOCK) : aucun argent réel ne circule.'] },
    ],
  },
  securite: {
    title: 'Sécurité',
    intro: 'Votre sécurité passe avant tout, y compris avant le paiement.',
    sections: [
      { h: 'En cas d\'urgence', p: ['Si vous êtes en danger, contactez immédiatement les secours. Police secours : 117 · Sapeurs-pompiers : 118 · SAMU : 119 (numéros à vérifier).'] },
      { h: 'Avant le départ', p: ['Vérifiez que le conducteur, le véhicule et la plaque correspondent au trajet affiché. Ne montrez votre code d\'embarquement qu\'au conducteur, à l\'embarquement.', 'Partagez votre trajet avec un proche.'] },
      { h: 'Pendant le trajet', p: ['Ceinture attachée, pauses régulières. Vous pouvez signaler un comportement dangereux à tout moment : le dossier est traité en priorité.'] },
      { h: 'Arnaques', p: ['Ne payez jamais en dehors de l\'application et ne communiquez jamais votre code mobile money. Waka ne vous le demandera jamais.'] },
    ],
  },
};

const EN: Record<Slug, LegalDoc> = {
  cgu: {
    title: 'Terms of service',
    intro: 'Version cgu-2026-11-v1. Waka connects private drivers and passengers for shared intercity rides in Cameroon. The French version prevails.',
    sections: [
      { h: '1. Purpose', p: ['Waka connects private drivers and passengers sharing the costs of a trip. Waka is not a carrier and operates no vehicles.'] },
      { h: '2. Private, non-profit carpooling', p: ['Drivers declare private carpooling: the contribution covers part of the trip costs and is not a wage. Commercial passenger transport is prohibited.'] },
      { h: '3. Price and transparency', p: ['Passengers see a total per seat, fees included, split into the driver contribution and the Waka service fee, under a versioned fee schedule shown before payment.'] },
      { h: '4. Payment', p: ['Payments are collected and held by a licensed payment service provider (PSP), not by Waka. The driver is paid only after the passenger confirms arrival, or after the dispute process. The PSP contract is in progress; payments are simulated in the demo.'] },
      { h: '5. Cancellation', p: ['Cancellation terms are summarised on each ride. A refund is effective only once confirmed by the PSP.'] },
      { h: '6. Disputes', p: ['Either party may open a case. Settlement is suspended at the PSP during review. The team arbitrates contractually based on both parties’ information; decisions are reasoned and can be appealed. Waka is not a judicial authority.'] },
    ],
  },
  confidentialite: {
    title: 'Privacy policy',
    intro: 'We collect the minimum data needed and never sell it. The French version prevails.',
    sections: [
      { h: 'Data collected', p: ['Phone number, display name, bookings, rides and dispute exchanges. For drivers: licence, ID and vehicle information, stored privately.'] },
      { h: 'Sharing', p: ['Your number is never fully shown to other members. Payment data is processed by the PSP. No data is sold.'] },
      { h: 'Your rights', p: ['Contact support to access, correct or delete your data, subject to legal retention obligations.'] },
    ],
  },
  'paiement-protege': {
    title: 'Protected payment, simply explained',
    intro: 'Waka does not hold your money. Funds are collected and conditionally held by a licensed payment provider until the end of the ride.',
    sections: [
      { h: '1. You pay with mobile money', p: ['Choose MTN Mobile Money or Orange Money and approve on your phone. Waka never asks for your PIN.'] },
      { h: '2. The partner confirms', p: ['Your booking is confirmed only after the partner confirms payment, verified by our server.'] },
      { h: '3. Funds are held by the partner', p: ['During the ride, neither the driver nor Waka can freely use the funds.'] },
      { h: '4. You confirm arrival', p: ['The payout is then requested from the partner (“Payout requested”), then confirmed by it (“Payout confirmed”).'] },
      { h: '5. If something goes wrong', p: ['Report a problem before confirming: settlement is suspended until a reasoned decision is executed by the partner.'] },
      { h: 'Current status', p: ['The PSP contract is in progress. This demo runs in simulated (MOCK) mode: no real money moves.'] },
    ],
  },
  securite: {
    title: 'Safety',
    intro: 'Your safety comes first, before payment.',
    sections: [
      { h: 'Emergency', p: ['If you are in danger, contact emergency services immediately. Police: 117 · Fire: 118 · Ambulance: 119 (numbers to be verified).'] },
      { h: 'Before departure', p: ['Check that driver, vehicle and plate match the ride. Only show your boarding code to the driver when boarding.'] },
      { h: 'Scams', p: ['Never pay outside the app and never share your mobile money PIN.'] },
    ],
  },
};

export function getLegal(slug: Slug, locale: Locale): LegalDoc {
  if (locale === 'en') return EN[slug];
  const d = FR[slug];
  return { title: frTypo(d.title), intro: frTypo(d.intro), sections: d.sections.map((s) => ({ h: frTypo(s.h), p: s.p.map(frTypo) })) };
}
