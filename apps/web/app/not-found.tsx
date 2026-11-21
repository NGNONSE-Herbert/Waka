import { Home, Search } from 'lucide-react';
import { getI18n } from '@/lib/i18n/server';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyRoad } from '@/components/brand/Illustrations';

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="container-w flex max-w-xl flex-col items-center py-20 text-center">
      <p className="font-display text-8xl font-extrabold tracking-tight text-green-100">404</p>
      <EmptyRoad className="-mt-6 h-32 w-52" />
      <h1 className="mt-4 text-3xl font-extrabold">{t.errors.notFoundTitle}</h1>
      <p className="mt-3 text-ink">{t.errors.notFoundBody}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/">
          <Home className="h-4 w-4" aria-hidden="true" />
          {t.errors.home}
        </ButtonLink>
        <ButtonLink href="/recherche" variant="secondary">
          <Search className="h-4 w-4" aria-hidden="true" />
          {t.nav.findTrip}
        </ButtonLink>
      </div>
    </div>
  );
}
