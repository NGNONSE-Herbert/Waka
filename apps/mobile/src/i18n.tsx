import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
// Les textes viennent du dictionnaire du site : une seule source pour le web et le mobile.
import { type Dict, dictionaries, fmt, isLocale, type Locale } from '../../web/lib/i18n';
import { frTypo, mapStrings } from '../../web/lib/i18n/typo';
import { getLegal } from '../../web/lib/legal';
import { setFormatLocale } from './format';

export { fmt, getLegal };
export type { Dict, Locale };

const frSource = {
  homeSubtitle: 'Paiement encadré · conducteurs vérifiés',
  seekHomeBody: 'Publiez votre demande, recevez les offres compatibles.',
  signInPrompt: 'Connectez-vous avec votre numéro pour continuer.',
  signInTrips: 'Connectez-vous pour retrouver vos réservations et vos billets.',
  signInDriver: 'Connectez-vous pour publier un trajet et gérer vos passagers.',
  signInRequest: 'Connectez-vous pour publier votre demande de voyage.',
  notifEmpty: 'Aucune notification',
  notifEmptyBody: 'Les confirmations, messages et versements apparaîtront ici.',
  chatTitle: 'Discussion avec {name}',
  chatPlaceholder: 'Votre message…',
  chatSend: 'Envoyer le message',
  chatClosed: 'La discussion est fermée pour cette réservation.',
  chatEmpty: 'Aucun message. Précisez par exemple votre position au point de rendez-vous.',
  chatRules: 'Pas de numéro, de lien ni de paiement hors de l\'application.',
  chatWrite: 'Écrire à {name}',
  chatWriteShort: 'Écrire',
  blockedLINK: 'Les liens ne sont pas autorisés dans la messagerie.',
  blockedPHONE: 'Les numéros de téléphone ne sont pas autorisés dans la messagerie.',
  blockedOFF_PLATFORM_PAYMENT: 'Les paiements hors de l\'application ne sont pas autorisés.',
  dateHint: 'JJ/MM/AAAA',
  dateInvalid: 'Date invalide (JJ/MM/AAAA).',
  datePast: 'Cette date est déjà passée.',
  chooseCity: 'Choisir une ville',
  chooseDate: 'Choisir une date',
  chooseTime: 'Choisir une heure',
  chooseSeats: 'Nombre de places',
  anyDay: 'Toutes les dates',
  totalNext: 'par place · total pour {n} à l\'étape suivante',
  oneSeatAll: '1 place · tout compris',
  payHold: 'Votre place est retenue pendant le paiement.',
  payDemoTitle: 'Mode démo : aucun débit réel. ',
  payDemoBody: 'À terme, vos fonds seront conservés par un partenaire de paiement agréé jusqu\'à votre arrivée. Waka ne les détiendra jamais.',
  payDetail: 'J\'ai lu le détail du prix : {fee} de frais de service et {driver} de contribution au conducteur.',
  simApprove: 'Simuler la validation',
  simRefuse: 'Simuler un refus',
  simBadge: 'MOCK · aucun argent réel',
  followTitle: 'Suivi du voyage',
  arrivedQuestion: 'Bien arrivé(e) à {city} ?',
  reportedBy: '{name} a signalé l\'arrivée.',
  willReport: 'L\'arrivée sera signalée par {name}.',
  disputeRecorded: 'Signalement enregistré',
  tripWith: 'Trajet avec {name}.',
  stepFunds: 'Fonds gérés par notre partenaire (simulé)',
  stepBoardDone: 'Code saisi par le conducteur',
  stepBoardWait: 'En attente du code',
  stepArrivedBy: 'Arrivée signalée par {name}',
  stepArrivedDone: 'Signalée',
  stepArrivedWait: 'Pas encore signalée',
  stepYours: 'Votre confirmation',
  stepYoursDone: 'Confirmée',
  stepYoursWait: 'En attente de votre réponse',
  stepYoursLater: 'Après l\'arrivée',
  stepPayout: 'Versement à {name}',
  stepPayoutLater: 'Après votre confirmation',
  stepPayoutRunning: 'Demandé au partenaire, en cours',
  payoutAuthorize: 'En confirmant, vous autorisez notre partenaire à verser {amount} à {name}.',
  payoutRunningBody: 'Notre partenaire traite le versement de {amount}. Cet écran se met à jour dès qu\'il est confirmé.',
  payoutDoneBody: 'Le partenaire a confirmé le versement de {amount}.',
  reportSuspends: 'Un signalement suspend le règlement le temps de l\'examen du dossier.',
  paidAfter: '{amount} · versés après votre confirmation',
  pinUsed: 'Code déjà utilisé.',
  pinGive: 'À donner à {name} au moment de monter. Usage unique.',
  trackTrip: 'Suivre le voyage',
  hubContinue: 'Compléter mon dossier',
  hubAddVehicle: 'Ajouter mon véhicule',
  publishRoute: 'Itinéraire',
  publishPlaces: 'Lieux',
  publishOffer: 'Votre offre',
  publishOptions: 'Options',
  fieldShort: 'Au moins 3 caractères.',
  departurePast: 'Choisissez un départ à venir.',
  ruleAdd: 'Ajouter',
  ruleLimit: '6 règles maximum.',
  plateHint: 'Exemple : LT 123 AB',
  yearInvalid: 'Année entre 1995 et 2027.',
  seatsInvalid: 'Entre 2 et 8 places.',
  demoRefLabel: 'Référence de démonstration',
  callEmergency: 'Appeler le {n}',
  accountDriver: 'Conduire avec Waka',
  accountLegal: 'Informations',
  accountDemoNotice: 'Démonstration : données fictives, aucun paiement réel.',
  budgetInvalid: 'Budget entre 500 et 60 000 FCFA.',
  timeWindow: '{start} – {end}',
  notifBooked: 'Réservation',
  notif: {
    'booking.confirmed': 'Your booking is confirmed ({route}). Show your boarding code to the driver.',
    'booking.new_for_driver': 'New confirmed booking on your trip {route}.',
    'booking.cancelled': 'The booking {route} has been cancelled.',
    'booking.hold_expired': 'The payment time for {route} has passed; the seats were released.',
    'payout.paid': 'Payout of {amount} FCFA confirmed by our payment partner.',
    'refund.confirmed': 'Refund of {amount} FCFA confirmed by our payment partner.',
    'dispute.opened': 'A dispute was opened on your booking. You can add your information.',
    'dispute.evidence_requested': 'The Waka team is asking for information on your dispute.',
    'dispute.resolved': 'Your dispute is resolved. You have 7 days to request a review.',
    'trip.match': 'A new trip matches your request {route}.',
    'message.new': 'New message on the trip {route}.',
  },
};

type MobileDict = typeof frSource;

const en: MobileDict = {
  homeSubtitle: 'Protected payment · verified drivers',
  seekHomeBody: 'Post your request, receive matching offers.',
  signInPrompt: 'Sign in with your number to continue.',
  signInTrips: 'Sign in to find your bookings and tickets.',
  signInDriver: 'Sign in to publish a trip and manage your passengers.',
  signInRequest: 'Sign in to post your trip request.',
  notifEmpty: 'No notifications',
  notifEmptyBody: 'Confirmations, messages and payouts will appear here.',
  chatTitle: 'Chat with {name}',
  chatPlaceholder: 'Your message…',
  chatSend: 'Send message',
  chatClosed: 'The chat is closed for this booking.',
  chatEmpty: 'No messages yet. You can share where you are at the meeting point.',
  chatRules: 'No phone numbers, links or payments outside the app.',
  chatWrite: 'Message {name}',
  chatWriteShort: 'Message',
  blockedLINK: 'Links are not allowed in messages.',
  blockedPHONE: 'Phone numbers are not allowed in messages.',
  blockedOFF_PLATFORM_PAYMENT: 'Payments outside the app are not allowed.',
  dateHint: 'DD/MM/YYYY',
  dateInvalid: 'Invalid date (DD/MM/YYYY).',
  datePast: 'This date has already passed.',
  chooseCity: 'Choose a city',
  chooseDate: 'Choose a date',
  chooseTime: 'Choose a time',
  chooseSeats: 'Number of seats',
  anyDay: 'All dates',
  totalNext: 'per seat · total for {n} on the next step',
  oneSeatAll: '1 seat · all included',
  payHold: 'Your seat is held during payment.',
  payDemoTitle: 'Demo mode: no real charge. ',
  payDemoBody: 'Eventually, your funds will be held by a licensed payment partner until you arrive. Waka will never hold them.',
  payDetail: 'I have read the price details: {fee} service fee and {driver} driver contribution.',
  simApprove: 'Simulate approval',
  simRefuse: 'Simulate refusal',
  simBadge: 'MOCK · no real money',
  followTitle: 'Trip tracking',
  arrivedQuestion: 'Arrived safely in {city}?',
  reportedBy: '{name} reported the arrival.',
  willReport: '{name} will report the arrival.',
  disputeRecorded: 'Report recorded',
  tripWith: 'Trip with {name}.',
  stepFunds: 'Funds held by our partner (simulated)',
  stepBoardDone: 'Code entered by the driver',
  stepBoardWait: 'Waiting for the code',
  stepArrivedBy: 'Arrival reported by {name}',
  stepArrivedDone: 'Reported',
  stepArrivedWait: 'Not reported yet',
  stepYours: 'Your confirmation',
  stepYoursDone: 'Confirmed',
  stepYoursWait: 'Waiting for your answer',
  stepYoursLater: 'After arrival',
  stepPayout: 'Payout to {name}',
  stepPayoutLater: 'After your confirmation',
  stepPayoutRunning: 'Requested from the partner, in progress',
  payoutAuthorize: 'By confirming, you authorise our partner to pay {amount} to {name}.',
  payoutRunningBody: 'Our partner is processing the {amount} payout. This screen updates once it is confirmed.',
  payoutDoneBody: 'The partner confirmed the {amount} payout.',
  reportSuspends: 'A report suspends settlement while the case is reviewed.',
  paidAfter: '{amount} · paid out after your confirmation',
  pinUsed: 'Code already used.',
  pinGive: 'Give it to {name} when boarding. Single use.',
  trackTrip: 'Track the trip',
  hubContinue: 'Complete my file',
  hubAddVehicle: 'Add my vehicle',
  publishRoute: 'Route',
  publishPlaces: 'Places',
  publishOffer: 'Your offer',
  publishOptions: 'Options',
  fieldShort: 'At least 3 characters.',
  departurePast: 'Choose an upcoming departure.',
  ruleAdd: 'Add',
  ruleLimit: '6 rules maximum.',
  plateHint: 'Example: LT 123 AB',
  yearInvalid: 'Year between 1995 and 2027.',
  seatsInvalid: 'Between 2 and 8 seats.',
  demoRefLabel: 'Demo reference',
  callEmergency: 'Call {n}',
  accountDriver: 'Drive with Waka',
  accountLegal: 'Information',
  accountDemoNotice: 'Demo: fictional data, no real payment.',
  budgetInvalid: 'Budget between 500 and 60,000 FCFA.',
  timeWindow: '{start} – {end}',
  notifBooked: 'Booking',
  notif: frSource.notif,
};

const mobile: Record<Locale, MobileDict> = { fr: mapStrings(frSource, frTypo) as MobileDict, en };

const STORAGE_KEY = 'waka.locale';
let current: { locale: Locale; t: Dict; m: MobileDict } = { locale: 'fr', t: dictionaries.fr, m: mobile.fr };
/** Pour le code hors composants (messages d'erreur). */
export const currentI18n = () => current;

type I18n = { locale: Locale; t: Dict; m: MobileDict; setLocale: (l: Locale) => void };
const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('fr');

  const apply = useCallback((l: Locale) => {
    setFormatLocale(l);
    current = { locale: l, t: dictionaries[l], m: mobile[l] };
    setLocaleState(l);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (isLocale(v)) apply(v);
      })
      .catch(() => {});
  }, [apply]);

  const setLocale = useCallback(
    (l: Locale) => {
      apply(l);
      AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {});
    },
    [apply],
  );

  const value = useMemo(() => ({ locale, t: dictionaries[locale], m: mobile[locale], setLocale }), [locale, setLocale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n hors de I18nProvider');
  return v;
}
