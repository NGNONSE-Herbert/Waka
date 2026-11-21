'use client';
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, FlaskConical, MessageSquareText, Phone, Sparkles, UserRound } from 'lucide-react';
import { OtpStartInput, OtpVerifyInput } from '@waka/contracts';
import { api, isApiError, type OtpStart } from '@/lib/api';
import { useI18n } from '@/lib/i18n/client';
import { errorMessage, fmt } from '@/lib/i18n';
import { cmE164, formatCmLocal, isCmMobile, remaining } from '@/lib/format';
import { DEMO_MODE, TERMS_VERSION } from '@/lib/env';
import { useSession } from './SessionProvider';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, describedBy } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/States';
import { cn } from '@/lib/cn';

const DEMO_ACCOUNTS = [
  { phone: '690000001', key: 'demoAicha' },
  { phone: '690000004', key: 'demoJunior' },
  { phone: '677000002', key: 'demoSerge' },
  { phone: '650000003', key: 'demoNadege' },
] as const;

function safeNext(v: string | null): string {
  if (!v || !v.startsWith('/') || v.startsWith('//') || v.startsWith('/connexion')) return '/';
  return v;
}

export function LoginFlow() {
  const { t } = useI18n();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const [challenge, setChallenge] = useState<(OtpStart & { phone: string }) | null>(null);

  return (
    <div className="rounded-[2rem] bg-white p-6 shadow-lift ring-1 ring-line sm:p-8">
      {!challenge ? (
        <PhoneStep onSent={setChallenge} />
      ) : (
        <OtpStep challenge={challenge} next={next} onBack={() => setChallenge(null)} onResent={setChallenge} />
      )}
    </div>
  );
}

function PhoneStep({ onSent }: { onSent: (c: OtpStart & { phone: string }) => void }) {
  const { t } = useI18n();
  const schema = z.object({ phone: z.string().refine(isCmMobile, t.auth.phoneInvalid) });
  const { register, handleSubmit, setValue, formState, setFocus } = useForm<{ phone: string }>({ resolver: zodResolver(schema), defaultValues: { phone: '' } });
  const [error, setError] = useState<unknown>(null);
  const reg = register('phone');

  const submit = handleSubmit(async ({ phone }) => {
    setError(null);
    const e164 = cmE164(phone);
    const parsed = OtpStartInput.safeParse({ phone: e164 });
    if (!parsed.success) return;
    try {
      const c = await api.auth.otpStart(e164);
      onSent({ ...c, phone: e164 });
    } catch (e) {
      setError(e);
    }
  });

  return (
    <>
      <h1 className="text-3xl font-extrabold">{t.auth.title}</h1>
      <p className="mt-2 text-ink">{t.auth.subtitle}</p>
      <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
        <Field id="phone" label={t.auth.phoneLabel} hint={t.auth.phoneHint} error={formState.errors.phone?.message}>
          <div className="flex items-stretch gap-2">
            <span className="flex min-h-14 items-center gap-2 rounded-2xl bg-sand px-4 font-display font-bold text-night-900" aria-hidden="true">
              <span className="h-3 w-4 rounded-[2px] bg-[linear-gradient(90deg,#007a5e_33%,#ce1126_33%_66%,#fcd116_66%)]" />
              +237
            </span>
            <Input
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="6XX XXX XXX"
              className="min-h-14 font-display text-lg font-bold tracking-wider"
              aria-invalid={formState.errors.phone ? true : undefined}
              aria-describedby={describedBy('phone', formState.errors.phone, true)}
              {...reg}
              onChange={(e) => {
                e.target.value = formatCmLocal(e.target.value);
                void reg.onChange(e);
              }}
            />
          </div>
        </Field>
        {error ? <ErrorState compact error={error} /> : null}
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          <MessageSquareText className="h-5 w-5" aria-hidden="true" />
          {formState.isSubmitting ? t.auth.sending : t.auth.sendCode}
        </Button>
      </form>

      {DEMO_MODE && (
        <section className="mt-8 rounded-3xl border-2 border-dashed border-amber-300 bg-amber-50 p-5" aria-labelledby="demo-accounts">
          <h2 id="demo-accounts" className="flex items-center gap-2 font-display font-extrabold text-amber-800">
            <FlaskConical className="h-4 w-4" aria-hidden="true" />
            {t.auth.demoAccountsTitle}
          </h2>
          <p className="mt-1 text-xs text-amber-800">{t.auth.demoAccountsHint}</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.phone}>
                <button
                  type="button"
                  onClick={() => {
                    setValue('phone', formatCmLocal(a.phone), { shouldValidate: true });
                    setFocus('phone');
                  }}
                  className="flex min-h-12 w-full flex-col items-start justify-center rounded-2xl bg-white px-3 py-2 text-left ring-1 ring-amber-200 transition hover:ring-amber-400"
                >
                  <span className="text-sm font-bold text-night-900">{t.auth[a.key]}</span>
                  <span className="tabular text-xs text-ink">+237 {formatCmLocal(a.phone)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function OtpStep({
  challenge,
  next,
  onBack,
  onResent,
}: {
  challenge: OtpStart & { phone: string };
  next: string;
  onBack: () => void;
  onResent: (c: OtpStart & { phone: string }) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { refresh } = useSession();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [now, setNow] = useState(() => Date.now());
  const [resendAt, setResendAt] = useState(() => Date.now() + 30_000);
  const [resending, setResending] = useState(false);

  const schema = z.object({
    code: OtpVerifyInput.shape.code,
    displayName: z.union([z.literal(''), z.string().trim().min(2, t.auth.displayNameInvalid).max(60, t.auth.displayNameInvalid)]),
    terms: z.boolean().refine((v) => v, t.auth.termsRequired),
  });
  type Form = z.infer<typeof schema>;
  const { register, handleSubmit, setValue, formState, watch } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { code: '', displayName: '', terms: false },
  });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    refs.current[0]?.focus();
    return () => clearInterval(id);
  }, []);

  const setCode = (arr: string[]) => {
    setDigits(arr);
    setValue('code', arr.join(''), { shouldValidate: formState.isSubmitted });
  };

  const onDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, '');
    if (clean.length > 1) return fill(clean, i);
    const arr = [...digits];
    arr[i] = clean;
    setCode(arr);
    if (clean && i < 5) refs.current[i + 1]?.focus();
  };

  const fill = (s: string, start = 0) => {
    const arr = [...digits];
    for (let k = 0; k < s.length && start + k < 6; k++) arr[start + k] = s[k] ?? '';
    setCode(arr);
    refs.current[Math.min(5, start + s.length)]?.focus();
  };

  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const s = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (s) {
      e.preventDefault();
      fill(s, 0);
    }
  };

  const submit = handleSubmit(async (v) => {
    setError(null);
    const body = OtpVerifyInput.parse({
      challengeId: challenge.challengeId,
      code: v.code,
      acceptedTermsVersion: TERMS_VERSION,
      ...(v.displayName ? { displayName: v.displayName.trim() } : {}),
    });
    try {
      await api.auth.otpVerify(body);
      await refresh();
      router.replace(next);
      router.refresh();
    } catch (e) {
      setError(e);
      if (isApiError(e) && /OTP|CODE/.test(e.code)) setCode(Array(6).fill(''));
    }
  });

  const resend = async () => {
    setResending(true);
    setError(null);
    try {
      const c = await api.auth.otpStart(challenge.phone);
      onResent({ ...c, phone: challenge.phone });
      setResendAt(Date.now() + 30_000);
      setCode(Array(6).fill(''));
    } catch (e) {
      setError(e);
    } finally {
      setResending(false);
    }
  };

  const exp = remaining(challenge.expiresAt, now);
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const terms = watch('terms');
  const codeErr = formState.errors.code ? t.auth.otpInvalid : undefined;

  return (
    <>
      <button type="button" onClick={onBack} className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-green-700 hover:bg-green-50">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t.auth.changeNumber}
      </button>
      <h1 className="mt-2 text-3xl font-extrabold">{t.auth.otpTitle}</h1>
      <p className="mt-2 text-ink">{fmt(t.auth.otpSentTo, { phone: challenge.maskedPhone })}</p>

      {challenge.devCode && (
        <div className="mt-6 rounded-3xl bg-night-900 p-5 text-ivory" role="note" aria-label={t.auth.devBannerTitle}>
          <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-amber-300">
            <FlaskConical className="h-4 w-4" aria-hidden="true" />
            {t.auth.devBannerTitle}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="tabular font-display text-4xl font-extrabold tracking-[0.3em]" data-testid="dev-code">
              {challenge.devCode}
            </p>
            <Button variant="amber" size="sm" onClick={() => fill(challenge.devCode ?? '', 0)}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {t.auth.devFill}
            </Button>
          </div>
          <p className="mt-2 text-xs text-night-300">{t.auth.devBannerBody}</p>
        </div>
      )}

      <form onSubmit={submit} className="mt-6 space-y-6" noValidate>
        <fieldset>
          <legend className="text-sm font-semibold text-night-900">{t.auth.otpLabel}</legend>
          <div className="mt-2 flex justify-between gap-2">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                value={d}
                onChange={(e) => onDigit(i, e.target.value)}
                onKeyDown={(e) => onKey(i, e)}
                onPaste={onPaste}
                onFocus={(e) => e.target.select()}
                inputMode="numeric"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                maxLength={6}
                aria-label={fmt(t.auth.otpDigit, { n: i + 1 })}
                aria-invalid={codeErr ? true : undefined}
                aria-describedby={codeErr ? 'otp-error' : 'otp-exp'}
                className={cn(
                  'tabular h-14 w-full min-w-0 max-w-14 rounded-2xl bg-ivory text-center font-display text-2xl font-extrabold text-night-900 ring-1 ring-inset ring-line transition focus:bg-white focus:ring-2 focus:ring-green-500 sm:h-16',
                  d && 'bg-green-50 ring-green-300',
                  codeErr && 'ring-2 ring-danger',
                )}
              />
            ))}
          </div>
          {codeErr && (
            <p id="otp-error" role="alert" className="mt-2 text-sm font-medium text-danger">
              {codeErr}
            </p>
          )}
          <p id="otp-exp" className="mt-2 text-xs text-ink" aria-live="polite">
            {exp.total > 0 ? fmt(t.auth.expiresIn, { m: exp.m, s: String(exp.s).padStart(2, '0') }) : t.auth.expired}
          </p>
        </fieldset>

        <Field
          id="displayName"
          label={
            <span className="flex items-center gap-1.5">
              <UserRound className="h-4 w-4 text-green-600" aria-hidden="true" />
              {t.auth.displayName}
            </span>
          }
          optionalLabel={t.common.optional}
          hint={t.auth.displayNameHint}
          error={formState.errors.displayName?.message}
        >
          <Input
            id="displayName"
            autoComplete="given-name"
            aria-invalid={formState.errors.displayName ? true : undefined}
            aria-describedby={describedBy('displayName', formState.errors.displayName, true)}
            {...register('displayName')}
          />
        </Field>

        <Checkbox
          id="terms"
          error={formState.errors.terms?.message}
          label={
            <>
              {t.auth.terms.split(/(\{cgu\}|\{privacy\}|\{v\})/).map((part, i) =>
                part === '{cgu}' ? (
                  <Link key={i} href="/cgu" target="_blank" className="font-semibold text-green-700 underline underline-offset-2">
                    {t.auth.termsCgu}
                  </Link>
                ) : part === '{privacy}' ? (
                  <Link key={i} href="/confidentialite" target="_blank" className="font-semibold text-green-700 underline underline-offset-2">
                    {t.auth.termsPrivacy}
                  </Link>
                ) : part === '{v}' ? (
                  <code key={i} className="whitespace-nowrap rounded bg-sand px-1 text-xs">
                    {TERMS_VERSION}
                  </code>
                ) : (
                  <span key={i}>{part}</span>
                ),
              )}
            </>
          }
          {...register('terms')}
        />

        {error ? <ErrorState compact error={error} /> : null}

        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting} data-terms={terms ? '1' : '0'}>
          <Phone className="h-5 w-5" aria-hidden="true" />
          {formState.isSubmitting ? t.auth.verifying : t.auth.verify}
        </Button>

        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={resend} disabled={resendIn > 0} loading={resending}>
            {resendIn > 0 ? fmt(t.auth.resendIn, { s: resendIn }) : t.auth.resend}
          </Button>
        </div>
      </form>
    </>
  );
}
