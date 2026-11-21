import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ShieldCheck } from 'lucide-react';
import { getI18n } from '@/lib/i18n/server';
import { LoginFlow } from '@/components/session/LoginFlow';
import { LogoMark } from '@/components/brand/Logo';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.title, robots: { index: false } };
}

export default async function LoginPage() {
  const { t } = await getI18n();
  return (
    <div className="container-w grid gap-8 py-8 md:py-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-stretch">
      <aside className="relative isolate hidden overflow-hidden rounded-[2rem] bg-night-900 p-10 text-ivory lg:flex lg:flex-col lg:justify-between">
        <div className="pattern-ndop absolute inset-0 -z-10 opacity-70" aria-hidden="true" />
        <div className="absolute -bottom-24 -right-24 -z-10 h-80 w-80 rounded-full bg-green-500/30 blur-3xl" aria-hidden="true" />
        <LogoMark className="h-14 w-14" tone="dark" />
        <div>
          <ShieldCheck className="h-10 w-10 text-amber-400" aria-hidden="true" />
          <p className="mt-4 font-display text-3xl font-extrabold leading-tight">{t.auth.sideTitle}</p>
          <p className="mt-3 text-night-200">{t.auth.sideBody}</p>
        </div>
      </aside>
      <div className="mx-auto w-full max-w-lg">
        <Suspense>
          <LoginFlow />
        </Suspense>
      </div>
    </div>
  );
}
