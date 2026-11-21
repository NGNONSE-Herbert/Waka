'use client';
import { useEffect } from 'react';

/** Enregistre le service worker en production uniquement (en dev, il gênerait le rechargement à chaud). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        /* PWA facultative : l’échec d’enregistrement n’affecte pas l’application */
      });
    };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
  }, []);
  return null;
}
