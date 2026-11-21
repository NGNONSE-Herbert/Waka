import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pwd: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;

export const sha256 = (input: string | Buffer): string => createHash('sha256').update(input).digest('hex');
export const hmacSha256 = (key: string | Buffer, input: string | Buffer): string => createHmac('sha256', key).update(input).digest('hex');
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/** Comparaison à temps constant de deux chaînes. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

export const randomDigits = (n: number): string => Array.from({ length: n }, () => randomInt(0, 10)).join('');

// ─── Mots de passe (scrypt) ───────────────────────────────────────────────────
const SCRYPT = { N: 16384, r: 8, p: 1 };
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return timingSafeEqual(key, expected);
}

// ─── Chiffrement symétrique (AES-256-GCM) : PIN d'embarquement, secrets TOTP ───
export class Sealer {
  private readonly key: Buffer;
  constructor(appSecret: string) {
    this.key = createHash('sha256').update(`waka:seal:v1:${appSecret}`).digest();
  }
  seal(plain: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return `v1.${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${enc.toString('base64url')}`;
  }
  open(sealed: string): string {
    const [v, iv, tag, enc] = sealed.split('.');
    if (v !== 'v1' || !iv || !tag || !enc) throw new Error('Format scellé invalide');
    const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8');
  }
}

// ─── TOTP (RFC 6238 / RFC 4226) ───────────────────────────────────────────────
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Base32 invalide');
    value = ((value << 5) | idx) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
export const generateTotpSecret = (): string => base32Encode(randomBytes(20));

export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(buf).digest();
  const offset = h[h.length - 1]! & 0x0f;
  const bin = ((h[offset]! & 0x7f) << 24) | (h[offset + 1]! << 16) | (h[offset + 2]! << 8) | h[offset + 3]!;
  return String(bin % 10 ** digits).padStart(digits, '0');
}
export function totp(secretB32: string, at = Date.now(), step = 30): string {
  return hotp(base32Decode(secretB32), Math.floor(at / 1000 / step));
}
/** Vérifie un code TOTP avec une tolérance de ±1 pas (dérive d'horloge). */
export function verifyTotp(secretB32: string, code: string, at = Date.now(), window = 1): boolean {
  const key = base32Decode(secretB32);
  const counter = Math.floor(at / 1000 / 30);
  let ok = false;
  for (let i = -window; i <= window; i++) if (safeEqual(hotp(key, counter + i), code)) ok = true;
  return ok;
}

/** JSON canonique (clés triées) pour les empreintes d'audit. */
export function canonicalJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}
