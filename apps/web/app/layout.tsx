import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Figtree } from 'next/font/google';
import './globals.css';
import { getI18n } from '@/lib/i18n/server';
import { I18nProvider } from '@/lib/i18n/client';
import { SessionProvider } from '@/components/session/SessionProvider';
import { DemoBanner, Footer, Header } from '@/components/layout/Chrome';
import { BottomNav } from '@/components/layout/HeaderClient';
import { ServiceWorkerRegister } from '@/components/layout/ServiceWorkerRegister';

const bricolage = Bricolage_Grotesque({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-bricolage', display: 'swap' });
const figtree = Figtree({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-figtree', display: 'swap' });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: t.meta.title, template: '%s · Waka' },
    description: t.meta.description,
    applicationName: 'Waka',
    appleWebApp: { capable: true, title: 'Waka', statusBarStyle: 'black-translucent' },
    formatDetection: { telephone: false },
    icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }], apple: '/icons/apple-180.png' },
  };
}

export const viewport: Viewport = {
  themeColor: '#123A2A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getI18n();
  return (
    <html lang={locale} className={`${bricolage.variable} ${figtree.variable}`}>
      <body className="min-h-dvh">
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-xl focus:bg-night-900 focus:px-4 focus:py-3 focus:text-ivory"
        >
          {t.common.skipToContent}
        </a>
        <I18nProvider locale={locale}>
          <SessionProvider>
            <DemoBanner t={t} />
            <Header t={t} />
            <main id="contenu" className="safe-bottom min-h-[60vh]">
              {children}
            </main>
            <div className="pb-[calc(env(safe-area-inset-bottom)+4rem)] md:pb-0">
              <Footer t={t} />
            </div>
            <BottomNav />
          </SessionProvider>
        </I18nProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
