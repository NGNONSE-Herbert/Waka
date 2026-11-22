import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Waka — covoiturage Cameroun',
    short_name: 'Waka',
    description: 'Covoiturage interurbain au Cameroun : conducteurs vérifiés, paiement encadré.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F3F7EE',
    theme_color: '#123A2A',
    lang: 'fr',
    categories: ['travel', 'navigation'],
    icons: [
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
      { src: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' },
      { src: '/icons/icon-512.png', type: 'image/png', sizes: '512x512' },
      { src: '/icons/maskable-512.png', type: 'image/png', sizes: '512x512', purpose: 'maskable' },
    ],
  };
}
