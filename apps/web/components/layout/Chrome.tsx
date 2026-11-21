import Link from 'next/link';
import { FlaskConical } from 'lucide-react';
import { BRAND } from '@waka/domain';
import { Logo } from '@/components/brand/Logo';
import type { Dict } from '@/lib/i18n';
import { DEMO_MODE } from '@/lib/env';
import { AccountMenu, HeaderNavLinks, LangSwitch } from './HeaderClient';

export function DemoBanner({ t }: { t: Dict }) {
  if (!DEMO_MODE) return null;
  return (
    <div className="bg-amber-400 text-night-900">
      <p className="container-w flex min-h-8 items-center justify-center gap-2 py-1 text-center text-xs font-bold">
        <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {t.demo.banner}
      </p>
    </div>
  );
}

export function Header({ t }: { t: Dict }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-ivory/90 backdrop-blur-md supports-[backdrop-filter]:bg-ivory/75">
      <div className="container-w flex h-16 items-center justify-between gap-3">
        <Link href="/" className="-ml-1 rounded-xl p-1" aria-label={BRAND.name}>
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <HeaderNavLinks />
          <div className="hidden sm:block">
            <LangSwitch />
          </div>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}

export function Footer({ t }: { t: Dict }) {
  const col = 'space-y-2 text-sm';
  const a = 'inline-flex min-h-9 items-center text-night-200 hover:text-amber-300';
  return (
    <footer className="relative overflow-hidden bg-night-950 text-ivory">
      <div className="pattern-ndop absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="container-w relative grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo tone="dark" />
          <p className="mt-4 font-display text-lg font-bold text-amber-300">{t.footer.tagline}</p>
          <p className="mt-1 max-w-xs text-sm text-night-200">{t.footer.promise}</p>
          <div className="mt-6">
            <LangSwitch tone="dark" />
          </div>
        </div>
        <div className={col}>
          <h2 className="eyebrow text-night-300">{t.footer.product}</h2>
          <ul className="space-y-1">
            <li><Link className={a} href="/recherche">{t.nav.findTrip}</Link></li>
            <li><Link className={a} href="/conducteur">{t.nav.offerSeats}</Link></li>
            <li><Link className={a} href="/demande">{t.landing.seekTitle}</Link></li>
            <li><Link className={a} href="/#comment-ca-marche">{t.footer.howItWorks}</Link></li>
          </ul>
        </div>
        <div className={col}>
          <h2 className="eyebrow text-night-300">{t.footer.help}</h2>
          <ul className="space-y-1">
            <li><Link className={a} href="/paiement-protege">{t.footer.protectedPayment}</Link></li>
            <li><Link className={a} href="/securite">{t.footer.safety}</Link></li>
          </ul>
        </div>
        <div className={col}>
          <h2 className="eyebrow text-night-300">{t.footer.legal}</h2>
          <ul className="space-y-1">
            <li><Link className={a} href="/cgu">{t.footer.cgu}</Link></li>
            <li><Link className={a} href="/confidentialite">{t.footer.privacy}</Link></li>
          </ul>
        </div>
      </div>
      <div className="relative border-t border-white/10">
        <div className="container-w flex flex-col gap-2 py-6 text-xs text-night-300 md:flex-row md:items-center md:justify-between">
          <p>
            © 2026 {BRAND.name} · {t.footer.nameNotice}
          </p>
          <p>{t.footer.pspNotice}</p>
        </div>
      </div>
    </footer>
  );
}
