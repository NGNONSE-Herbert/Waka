'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as DM from '@radix-ui/react-dropdown-menu';
import { CarFront, ChevronDown, LogOut, Search, Ticket, User, Wallet, Globe, PlusCircle, Home } from 'lucide-react';
import { useTransition } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { LOCALE_COOKIE, type Locale } from '@/lib/i18n/config';
import { useSession, loginHref } from '@/components/session/SessionProvider';
import { Avatar } from '@/components/ui/Card';
import { buttonClass } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

export function LangSwitch({ tone = 'light', className }: { tone?: 'light' | 'dark'; className?: string }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (l: Locale) => {
    if (l === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
    start(() => router.refresh());
  };
  return (
    <div
      role="group"
      aria-label={t.nav.language}
      className={cn(
        'inline-flex items-center rounded-2xl p-1 text-xs font-bold',
        tone === 'dark' ? 'bg-white/10 text-ivory' : 'bg-sand text-night-800',
        pending && 'opacity-60',
        className,
      )}
    >
      <Globe className="mx-1.5 h-4 w-4 opacity-70" aria-hidden="true" />
      {(['fr', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={locale === l}
          onClick={() => set(l)}
          className={cn(
            'min-h-9 min-w-10 rounded-xl px-2 uppercase transition',
            locale === l ? (tone === 'dark' ? 'bg-amber-400 text-night-900' : 'bg-white text-night-900 shadow-sm') : 'opacity-75 hover:opacity-100',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function AccountMenu() {
  const { me, status, signOut } = useSession();
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();

  if (status === 'loading') return <div className="skeleton h-11 w-11 rounded-2xl" aria-hidden="true" />;
  if (!me) {
    return (
      <Link href={loginHref(pathname)} className={buttonClass('dark', 'sm', 'whitespace-nowrap')}>
        <User className="h-4 w-4" aria-hidden="true" />
        {t.common.signIn}
      </Link>
    );
  }
  const isDriver = me.driverStatus !== 'NONE';
  const item = 'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-semibold text-night-900 outline-none data-[highlighted]:bg-green-50';
  return (
    <DM.Root>
      <DM.Trigger
        className="flex min-h-11 items-center gap-2 rounded-2xl py-1 pl-1 pr-2 hover:bg-sand"
        aria-label={`${t.nav.accountMenu} — ${me.displayName}`}
      >
        <Avatar name={me.displayName} className="h-9 w-9 text-xs" />
        <span className="hidden max-w-32 truncate text-sm font-semibold lg:block">{me.displayName}</span>
        <ChevronDown className="h-4 w-4 text-ink" aria-hidden="true" />
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" sideOffset={8} className="z-50 w-64 rounded-2xl bg-white p-2 shadow-lift ring-1 ring-line">
          <div className="px-3 pb-2 pt-1">
            <p className="truncate font-display font-bold text-night-900">{me.displayName}</p>
            <p className="text-xs text-ink">{me.maskedPhone}</p>
          </div>
          <DM.Separator className="my-1 h-px bg-line" />
          <DM.Item className={item} onSelect={() => router.push('/mes-trajets')}>
            <Ticket className="h-4 w-4 text-green-600" aria-hidden="true" /> {t.nav.myTrips}
          </DM.Item>
          <DM.Item className={item} onSelect={() => router.push('/conducteur')}>
            <CarFront className="h-4 w-4 text-green-600" aria-hidden="true" /> {t.nav.driverSpace}
          </DM.Item>
          {isDriver && (
            <DM.Item className={item} onSelect={() => router.push('/conducteur/revenus')}>
              <Wallet className="h-4 w-4 text-green-600" aria-hidden="true" /> {t.nav.earnings}
            </DM.Item>
          )}
          <DM.Item className={item} onSelect={() => router.push('/compte')}>
            <User className="h-4 w-4 text-green-600" aria-hidden="true" /> {t.nav.account}
          </DM.Item>
          <DM.Separator className="my-1 h-px bg-line" />
          <DM.Item
            className={item}
            onSelect={async () => {
              await signOut();
              router.push('/');
              router.refresh();
            }}
          >
            <LogOut className="h-4 w-4 text-ink" aria-hidden="true" /> {t.nav.signOut}
          </DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

export function BottomNav() {
  const { t } = useI18n();
  const pathname = usePathname();
  const { me } = useSession();
  const items = [
    { href: '/', label: t.nav.search, icon: Home, match: (p: string) => p === '/' || p.startsWith('/recherche') || p.startsWith('/trajets') },
    { href: '/mes-trajets', label: t.nav.myTrips, icon: Ticket, match: (p: string) => p.startsWith('/mes-trajets') || p.startsWith('/reservations') || p.startsWith('/demande') },
    { href: me?.canPublishTrips ? '/conducteur/publier' : '/conducteur', label: t.nav.publish, icon: PlusCircle, match: (p: string) => p.startsWith('/conducteur') },
    { href: '/compte', label: t.nav.account, icon: User, match: (p: string) => p.startsWith('/compte') || p.startsWith('/connexion') },
  ];
  return (
    <nav
      aria-label={t.nav.mainNav}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {items.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={label}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn('flex min-h-16 flex-col items-center justify-center gap-1 text-[0.7rem] font-semibold transition', active ? 'text-green-700' : 'text-ink')}
              >
                <span className={cn('grid h-8 w-12 place-items-center rounded-full transition', active && 'bg-green-50')}>
                  <Icon className="h-5 w-5" aria-hidden="true" strokeWidth={active ? 2.4 : 2} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function HeaderNavLinks() {
  const { t } = useI18n();
  const pathname = usePathname();
  const { me } = useSession();
  const link = (active: boolean) =>
    cn('inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition', active ? 'text-green-700' : 'text-night-800 hover:text-green-700');
  return (
    <nav aria-label={t.nav.mainNav} className="hidden items-center gap-1 md:flex">
      <Link href="/recherche" className={link(pathname.startsWith('/recherche'))} aria-current={pathname.startsWith('/recherche') ? 'page' : undefined}>
        <Search className="h-4 w-4" aria-hidden="true" />
        {t.nav.findTrip}
      </Link>
      {me && (
        <Link href="/mes-trajets" className={link(pathname.startsWith('/mes-trajets'))} aria-current={pathname.startsWith('/mes-trajets') ? 'page' : undefined}>
          <Ticket className="h-4 w-4" aria-hidden="true" />
          {t.nav.myTrips}
        </Link>
      )}
      <Link href={me?.canPublishTrips ? '/conducteur/publier' : '/conducteur'} className={cn(buttonClass('secondary', 'sm'), 'ml-2')}>
        <PlusCircle className="h-4 w-4 text-green-600" aria-hidden="true" />
        {t.nav.offerSeats}
      </Link>
    </nav>
  );
}
