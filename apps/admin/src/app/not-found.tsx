import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="text-center">
        <p className="font-mono text-sm text-ink">404</p>
        <h1 className="mt-1 text-2xl font-bold">Page introuvable</h1>
        <p className="mt-2 text-sm text-ink">Cette adresse n’existe pas dans la console Waka Contrôle.</p>
        <Link href="/" className="mt-5 inline-block text-sm font-medium text-brand-strong hover:underline">Retour au cockpit</Link>
      </div>
    </div>
  );
}
