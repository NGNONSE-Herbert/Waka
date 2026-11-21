import type { Metadata, Viewport } from 'next';
import { Inter, Manrope } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap', weight: ['500', '600', '700', '800'] });

export const metadata: Metadata = {
  title: { default: 'Waka Contrôle', template: '%s · Waka Contrôle' },
  description: 'Console staff Waka — accès restreint.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#142436', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${manrope.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
