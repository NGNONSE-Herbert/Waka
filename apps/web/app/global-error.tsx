'use client';

/** Dernier filet de sécurité (erreur dans le layout racine) : HTML autonome, bilingue, sans dépendance. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#F8FAF8', color: '#142436' }}>
        <main style={{ maxWidth: 480, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 28 }}>Une erreur est survenue</h1>
          <p style={{ color: '#52606D' }}>Something went wrong. Réessayez dans un instant.</p>
          <button
            onClick={reset}
            style={{ marginTop: 24, minHeight: 48, padding: '0 24px', borderRadius: 16, border: 0, background: '#0B7A70', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
          >
            Réessayer / Retry
          </button>
        </main>
      </body>
    </html>
  );
}
