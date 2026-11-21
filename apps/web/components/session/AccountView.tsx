'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CarFront, ChevronRight, FileText, LifeBuoy, LogOut, ShieldCheck, Ticket, Wallet } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { RequireAuth, useSession } from './SessionProvider';
import { LangSwitch } from '@/components/layout/HeaderClient';
import { Avatar, Badge } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export function AccountView() {
  const { t } = useI18n();
  const { signOut } = useSession();
  const router = useRouter();
  return (
    <RequireAuth>
      {(me) => (
        <div className="container-w max-w-2xl py-8">
          <div className="flex items-center gap-4 rounded-[2rem] bg-night-900 p-6 text-ivory">
            <Avatar name={me.displayName} className="h-16 w-16 text-lg" tone="amber" />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-extrabold">{me.displayName}</h1>
              <p className="text-sm text-night-200">{me.maskedPhone}</p>
              <Badge tone="green" className="mt-2 bg-green-500/15 text-green-200 ring-green-400/30">
                {t.account.driverStatus[me.driverStatus]}
              </Badge>
            </div>
          </div>

          <nav className="mt-6 overflow-hidden rounded-[2rem] bg-white ring-1 ring-line" aria-label={t.account.title}>
            <ul className="divide-y divide-line">
              {[
                { href: '/mes-trajets', label: t.nav.myTrips, icon: Ticket },
                { href: '/conducteur', label: t.nav.driverSpace, icon: CarFront },
                ...(me.driverStatus === 'VERIFIED' ? [{ href: '/conducteur/revenus', label: t.nav.earnings, icon: Wallet }] : []),
                { href: '/paiement-protege', label: t.footer.protectedPayment, icon: ShieldCheck },
                { href: '/securite', label: t.account.help, icon: LifeBuoy },
                { href: '/cgu', label: t.footer.cgu, icon: FileText },
              ].map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link href={href} className="flex min-h-14 items-center gap-4 px-5 transition hover:bg-ivory">
                    <Icon className="h-5 w-5 text-green-600" aria-hidden="true" />
                    <span className="flex-1 font-semibold">{label}</span>
                    <ChevronRight className="h-5 w-5 text-ink" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-6 flex items-center justify-between gap-4 rounded-[2rem] bg-white p-5 ring-1 ring-line">
            <span className="font-semibold">{t.account.language}</span>
            <LangSwitch />
          </div>

          <Button
            variant="secondary"
            className="mt-6 w-full"
            onClick={async () => {
              await signOut();
              router.push('/');
              router.refresh();
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {t.account.signOut}
          </Button>
        </div>
      )}
    </RequireAuth>
  );
}
