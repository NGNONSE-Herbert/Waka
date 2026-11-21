'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  BadgeCheck, BookOpen, CreditCard, FileText, GitCompareArrows, LayoutDashboard, Lock, LogOut, Menu, Scale, ScrollText, ShieldCheck, ShieldX, Wallet, X,
} from 'lucide-react';
import { useSession } from './session';
import { Logo } from './logo';
import { Badge, cn } from './ui';
import { canSee, type ScreenKey } from '@/lib/permissions';
import { ROLE_LABEL } from '@/lib/models';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  screen: ScreenKey;
}

const NAV: (NavItem | { group: string; icon: NavItem['icon']; screen: ScreenKey; items: NavItem[] })[] = [
  { href: '/', label: 'Cockpit', icon: LayoutDashboard, screen: 'cockpit' },
  { href: '/kyc', label: 'Confiance & KYC', icon: BadgeCheck, screen: 'kyc' },
  { href: '/litiges', label: 'Litiges', icon: Scale, screen: 'disputes' },
  {
    group: 'Finances',
    icon: Wallet,
    screen: 'finance',
    items: [
      { href: '/finances/paiements', label: 'Paiements', icon: CreditCard, screen: 'finance' },
      { href: '/finances/rapprochement', label: 'Rapprochement', icon: GitCompareArrows, screen: 'finance' },
      { href: '/finances/grand-livre', label: 'Grand livre', icon: BookOpen, screen: 'finance' },
    ],
  },
  { href: '/audit', label: 'Journal d’audit', icon: ScrollText, screen: 'audit' },
  { href: '/politiques', label: 'Politiques', icon: FileText, screen: 'policies' },
];

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, pathname, allowed, nested }: { item: NavItem; pathname: string; allowed: boolean; nested?: boolean }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  const cls = cn(
    'group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors',
    nested && 'pl-9',
    active ? 'bg-night-700 text-white shadow-[inset_2px_0_0_#F5B942]' : 'text-night-200 hover:bg-night-800 hover:text-white',
  );
  if (!allowed) {
    return (
      <span
        aria-disabled="true"
        title="Permission requise pour ce module"
        className={cn('flex h-9 cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium text-night-300/60', nested && 'pl-9')}
      >
        {!nested ? <Icon aria-hidden className="size-4" /> : null}
        <span className="flex-1">{item.label}</span>
        <Lock aria-hidden className="size-3.5" />
        <span className="sr-only">(accès non autorisé pour votre rôle)</span>
      </span>
    );
  }
  return (
    <Link href={item.href} aria-current={active ? 'page' : undefined} className={cls}>
      {!nested ? <Icon aria-hidden className={cn('size-4', active ? 'text-amber' : 'text-night-300 group-hover:text-white')} /> : null}
      {item.label}
    </Link>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { me } = useSession();
  return (
    <div className="on-dark flex h-full flex-col bg-night text-white" onClick={(e) => { if ((e.target as HTMLElement).closest('a')) onNavigate?.(); }}>
      <div className="flex h-16 items-center gap-2 px-4">
        <Logo onDark />
        <span className="rounded-md bg-amber px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-night">Contrôle</span>
      </div>
      <nav aria-label="Navigation principale" className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="space-y-0.5">
          {NAV.map((n) =>
            'group' in n ? (
              <li key={n.group} className="pt-3">
                <p className="flex items-center gap-2.5 px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-night-300">
                  <n.icon aria-hidden className="size-4" /> {n.group}
                </p>
                <ul className="space-y-0.5">
                  {n.items.map((it) => (
                    <li key={it.href}><NavLink item={it} pathname={pathname} allowed={canSee(me.roles, it.screen)} nested /></li>
                  ))}
                </ul>
              </li>
            ) : (
              <li key={n.href}><NavLink item={n} pathname={pathname} allowed={canSee(me.roles, n.screen)} /></li>
            ),
          )}
        </ul>
      </nav>
      <div className="border-t border-night-800 px-4 py-3 text-[11.5px] leading-relaxed text-night-300">
        Fonds détenus par le partenaire PSP habilité. La console n’initie aucun débit hors politique.
      </div>
    </div>
  );
}

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const { me, logout } = useSession();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr] lg:bg-[linear-gradient(to_right,#142436_248px,transparent_248px)]">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Aller au contenu
      </a>
      <aside className="sticky top-0 hidden h-dvh lg:block">
        <SidebarContent />
      </aside>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-night/50 lg:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[272px] max-w-[85vw] shadow-xl lg:hidden" aria-describedby={undefined}>
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <SidebarContent onNavigate={() => setOpen(false)} />
            <Dialog.Close className="absolute right-3 top-4 rounded-md p-1.5 text-night-200 hover:bg-night-800" aria-label="Fermer le menu">
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
          <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6">
            <button type="button" onClick={() => setOpen(true)} className="-ml-1 rounded-md p-2 text-ink hover:bg-muted lg:hidden" aria-label="Ouvrir le menu">
              <Menu aria-hidden className="size-5" />
            </button>
            <span className="lg:hidden"><Logo compact /></span>
            <span
              className="inline-flex items-center gap-1.5 rounded-md border border-amber/60 bg-amber-soft px-2 py-1 text-[11.5px] font-semibold text-amber-ink"
              title="Environnement de démonstration : aucun mouvement de fonds réel"
            >
              <span aria-hidden className="size-1.5 rounded-full bg-amber" />
              {me.environment && me.environment.toUpperCase() !== 'MOCK' ? `${me.environment.toUpperCase()} — ` : 'MOCK / SANDBOX — '}aucun flux réel
            </span>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <div className="hidden flex-wrap items-center gap-1 md:flex" aria-label="Rôles">
                {me.roles.map((r) => (
                  <Badge key={r} tone="night" className="bg-night-800">{ROLE_LABEL[r]}</Badge>
                ))}
              </div>
              {me.mfaVerified ? (
                <Badge tone="green" icon={<ShieldCheck aria-hidden className="size-3" />}>MFA vérifiée</Badge>
              ) : (
                <Badge tone="red" icon={<ShieldX aria-hidden className="size-3" />}>MFA non vérifiée</Badge>
              )}
              <div className="hidden text-right leading-tight sm:block">
                <p className="text-[13px] font-semibold text-text">{me.displayName}</p>
                {me.email ? <p className="text-[11.5px] text-ink">{me.email}</p> : null}
              </div>
              <span aria-hidden className="grid size-8 place-items-center rounded-full bg-brand-soft font-display text-[13px] font-bold text-brand-deep">
                {me.displayName.slice(0, 1).toUpperCase()}
              </span>
              <button
                type="button"
                onClick={() => void logout()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-ink hover:bg-muted hover:text-text"
              >
                <LogOut aria-hidden className="size-4" />
                <span className="hidden sm:inline">Déconnexion</span>
              </button>
            </div>
          </div>
        </header>
        <main id="contenu" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6 sm:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
