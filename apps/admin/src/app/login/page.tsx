'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, KeyRound, Lock, ShieldCheck, Terminal } from 'lucide-react';
import { callAdmin, ApiRequestError } from '@/lib/api';
import { bool, str } from '@/lib/normalize';
import { Logo } from '@/components/logo';
import { Button, Field, Input, Notice } from '@/components/ui';

function safeNext(v: string | null): string {
  return v && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/login') ? v : '/';
}

const REASON: Record<string, { tone: 'amber' | 'blue'; text: string }> = {
  expired: { tone: 'amber', text: 'Votre session a expiré. Reconnectez-vous pour continuer.' },
  required: { tone: 'blue', text: 'Authentification requise pour accéder à la console.' },
  logout: { tone: 'blue', text: 'Vous êtes déconnecté·e. La session a été révoquée côté serveur.' },
};

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = safeNext(sp.get('next'));
  const reason = REASON[sp.get('reason') ?? ''];

  const [step, setStep] = useState<'credentials' | 'totp'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [devTotp, setDevTotp] = useState<string | null>(null);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [busy, setBusy] = useState(false);
  const totpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'totp') totpRef.current?.focus();
  }, [step]);

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await callAdmin('login', { body: { email: email.trim(), password }, silent401: true });
      const cid = str(res, 'challengeId', 'mfaChallengeId', 'challenge.id');
      if (!cid && bool(res, 'mfaRequired') === false) {
        router.replace(next);
        return;
      }
      if (!cid) throw new ApiRequestError(500, 'UNEXPECTED_SHAPE', 'Réponse de connexion inattendue : challengeId absent.', null);
      setChallengeId(cid);
      setDevTotp(str(res, 'devTotp', 'dev.totp'));
      setStep('totp');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err : new ApiRequestError(0, 'CLIENT_ERROR', String(err), null));
    } finally {
      setBusy(false);
    }
  }

  async function submitTotp(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeId) return;
    setError(null);
    setBusy(true);
    try {
      await callAdmin('mfa', { body: { challengeId, totp }, silent401: true });
      router.replace(next);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err : new ApiRequestError(0, 'CLIENT_ERROR', String(err), null));
      setTotp('');
      totpRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  const errorText = error
    ? error.status === 401 || error.code === 'INVALID_CREDENTIALS'
      ? step === 'credentials' ? 'Identifiants incorrects.' : 'Code TOTP invalide ou expiré.'
      : error.message
    : null;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section className="on-dark relative hidden overflow-hidden bg-night p-10 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-2">
          <Logo onDark />
          <span className="rounded-md bg-amber px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-night">Contrôle</span>
        </div>
        <div className="mt-auto max-w-md">
          <h1 className="text-3xl font-bold leading-tight">Console d’exploitation, de confiance et de règlement.</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-night-200">
            Vérifications conducteurs, litiges contradictoires, rapprochement PSP. Chaque action est motivée, journalisée et
            soumise à la séparation des tâches.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-night-200">
            <li className="flex gap-3"><ShieldCheck aria-hidden className="size-5 shrink-0 text-brand" /> Authentification forte obligatoire (mot de passe + TOTP).</li>
            <li className="flex gap-3"><Lock aria-hidden className="size-5 shrink-0 text-brand" /> Fonds détenus par le partenaire PSP habilité — aucun versement manuel.</li>
            <li className="flex gap-3"><KeyRound aria-hidden className="size-5 shrink-0 text-brand" /> Journal d’audit immuable, horodaté, chaîné.</li>
          </ul>
        </div>
        <svg aria-hidden className="pointer-events-none absolute -right-24 top-24 opacity-[0.07]" width="520" height="520" viewBox="0 0 100 100">
          <path d="M10 80 C 40 80, 40 20, 90 20" stroke="#F5B942" strokeWidth="6" fill="none" strokeLinecap="round" />
        </svg>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <Logo />
            <span className="rounded-md bg-amber px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-night">Contrôle</span>
          </div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-brand-strong">Accès staff restreint</p>
          <h2 className="mt-1 text-2xl font-bold">{step === 'credentials' ? 'Connexion' : 'Vérification en deux étapes'}</h2>
          <p className="mt-1 text-sm text-ink">
            {step === 'credentials'
              ? 'Utilisez votre compte professionnel Waka.'
              : <>Saisissez le code à 6 chiffres de votre application d’authentification pour <strong className="text-text">{email}</strong>.</>}
          </p>

          <div className="mt-5 space-y-3">
            {reason && step === 'credentials' ? <Notice tone={reason.tone}>{reason.text}</Notice> : null}
            {errorText ? (
              <div role="alert">
                <Notice tone="red" title={errorText}>
                  {error?.requestId ? <span className="font-mono text-[12px]">requestId {error.requestId}</span> : null}
                </Notice>
              </div>
            ) : null}
          </div>

          {step === 'credentials' ? (
            <form onSubmit={submitCredentials} className="mt-5 space-y-4" noValidate>
              <Field label="Adresse e-mail professionnelle" required>
                {(p) => <Input {...p} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@waka.test" />}
              </Field>
              <Field label="Mot de passe" required>
                {(p) => <Input {...p} type="password" autoComplete="current-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />}
              </Field>
              <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!email || password.length < 8}>
                Continuer
              </Button>
            </form>
          ) : (
            <form onSubmit={submitTotp} className="mt-5 space-y-4">
              {devTotp ? (
                <div className="rounded-lg border-2 border-dashed border-amber bg-amber-soft p-3" role="note" aria-label="Bannière développement">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-ink">
                    <Terminal aria-hidden className="size-3.5" /> DEV uniquement — jamais en production
                  </p>
                  <p className="mt-1 text-[13px] text-amber-ink">
                    Code TOTP renvoyé par l’API hors production :{' '}
                    <button type="button" className="rounded bg-surface px-1.5 py-0.5 font-mono text-base font-bold tracking-[0.2em] text-night ring-1 ring-amber" onClick={() => setTotp(devTotp)}>
                      {devTotp}
                    </button>{' '}
                    <span className="text-[12px]">(cliquer pour remplir)</span>
                  </p>
                </div>
              ) : null}
              <Field label="Code TOTP" required hint="Le code change toutes les 30 secondes.">
                {(p) => (
                  <Input
                    {...p}
                    ref={totpRef}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="\d{6}"
                    maxLength={6}
                    value={totp}
                    onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="h-12 text-center font-mono text-xl tracking-[0.5em]"
                    placeholder="••••••"
                  />
                )}
              </Field>
              <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={totp.length !== 6}>
                Vérifier et ouvrir la console
              </Button>
              <button type="button" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:text-text" onClick={() => { setStep('credentials'); setTotp(''); setError(null); setDevTotp(null); }}>
                <ArrowLeft aria-hidden className="size-3.5" /> Changer de compte
              </button>
            </form>
          )}

          <div className="mt-8 rounded-lg border border-line bg-surface p-3 text-[12px] leading-relaxed text-ink">
            <p className="font-semibold text-text">Avis de sécurité</p>
            Accès réservé au personnel habilité. Toute connexion et toute action sont journalisées (identité, adresse IP, horodatage)
            dans un journal immuable. Ne partagez jamais vos identifiants ni vos codes ; l’équipe Waka ne vous les demandera pas.
          </div>
        </div>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
