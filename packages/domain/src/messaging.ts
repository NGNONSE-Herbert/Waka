/**
 * Messagerie antifraude (FR-19) : un message ne doit pas sortir l'échange de la plateforme.
 * Bloque les liens, les numéros de téléphone et les demandes de paiement hors application.
 * Fonction pure : le texte refusé n'est ni stocké ni journalisé.
 */
export type MessageBlockReason = 'LINK' | 'PHONE' | 'OFF_PLATFORM_PAYMENT';
export type MessageVerdict = { ok: true } | { ok: false; reason: MessageBlockReason };

const LINK = /(?:https?:\/\/|www\.|\b(?:wa\.me|t\.me|bit\.ly)\b|\b[a-z][a-z0-9-]+\.(?:com|net|org|cm|io|me|app|ly|co|info|biz)(?:\/|\s|$))/;
const PHONE = /(?:\+|00)?\d(?:[\s.\-()]{0,2}\d){7,}/;
const PAY_VERB = '(?:paie|paye|payer|payez|paies|regle|regler|reglez|envoie|envoyer|envoyez|transfere|transferer|verse|verser|versez|donne|donner|donnez|pay|send|transfer)';
const OFF_CHANNEL = "(?:momo|mobile money|orange money|om|cash|especes|liquide|main a main|directement|hors (?:de )?l?'?appli(?:cation)?|directly|outside(?: the)? app)";
const PAY_THEN_CHANNEL = new RegExp(`\\b${PAY_VERB}\\b[^.!?\\n]{0,40}\\b${OFF_CHANNEL}(?=\\W|$)`);
const CHANNEL_THEN_PAY = new RegExp(`\\b${OFF_CHANNEL}\\b[^.!?\\n]{0,30}\\b${PAY_VERB}\\b`);

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’]/g, "'")
    .toLowerCase();

export function moderateMessage(text: string): MessageVerdict {
  const t = normalize(text);
  if (LINK.test(t)) return { ok: false, reason: 'LINK' };
  if (PHONE.test(t)) return { ok: false, reason: 'PHONE' };
  if (PAY_THEN_CHANNEL.test(t) || CHANNEL_THEN_PAY.test(t)) return { ok: false, reason: 'OFF_PLATFORM_PAYMENT' };
  return { ok: true };
}
