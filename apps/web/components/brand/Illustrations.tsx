/** Illustrations abstraites originales (SVG inline, sans image externe). */

/** Corridor Douala → Yaoundé : une ligne fluide avec nœuds-villes, et un véhicule qui la parcourt. */
export function CorridorHero({ className, fromLabel, toLabel, midLabel }: { className?: string; fromLabel: string; toLabel: string; midLabel: string }) {
  const d = 'M40 300 C 140 300 150 190 250 180 S 360 90 470 70';
  return (
    <svg viewBox="0 0 520 360" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="road" x1="0" x2="1" y1="1" y2="0">
          <stop offset="0" stopColor="#0E8F83" />
          <stop offset="1" stopColor="#F5B942" />
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#F5B942" stopOpacity="0.45" />
          <stop offset="1" stopColor="#F5B942" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* topographie */}
      <g fill="none" stroke="#9fb3c7" strokeOpacity="0.12">
        <path d="M0 250 C 120 230 200 280 320 250 S 480 200 520 210" />
        <path d="M0 210 C 110 190 210 240 330 210 S 470 150 520 160" />
        <path d="M0 330 C 130 310 230 350 360 320 S 480 290 520 300" />
        <path d="M0 120 C 120 110 220 150 330 120 S 460 70 520 80" />
      </g>
      {/* ruban de route */}
      <path d={d} fill="none" stroke="#27425d" strokeWidth="22" strokeLinecap="round" />
      <path d={d} fill="none" stroke="url(#road)" strokeWidth="4" strokeLinecap="round" className="route-draw" style={{ ['--len' as string]: 560 }} />
      <path d={d} fill="none" stroke="#F8FAF8" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="6 10" />
      {/* nœuds */}
      <circle cx="40" cy="300" r="40" fill="url(#glow)" />
      <circle cx="470" cy="70" r="46" fill="url(#glow)" />
      <g>
        <circle cx="40" cy="300" r="11" fill="#142436" stroke="#0E8F83" strokeWidth="4" />
        <circle cx="250" cy="180" r="6" fill="#142436" stroke="#9fb3c7" strokeWidth="3" />
        <circle cx="470" cy="70" r="11" fill="#142436" stroke="#F5B942" strokeWidth="4" />
      </g>
      <g fontFamily="var(--font-manrope), sans-serif" fontWeight="800" fill="#F8FAF8">
        <text x="62" y="328" fontSize="20">{fromLabel}</text>
        <text x="266" y="206" fontSize="13" fill="#9fb3c7" fontWeight="600">{midLabel}</text>
        <text x="400" y="38" fontSize="20">{toLabel}</text>
      </g>
      {/* véhicule en mouvement */}
      <g style={{ offsetPath: `path('${d}')`, animation: 'var(--animate-travel)', offsetRotate: 'auto' } as React.CSSProperties}>
        <rect x="-12" y="-7" width="24" height="14" rx="5" fill="#F5B942" />
        <rect x="2" y="-5" width="6" height="10" rx="2" fill="#142436" opacity="0.6" />
      </g>
    </svg>
  );
}

/** Ruban de route décoratif (séparateurs, cartes). */
export function RoadRibbon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 60" preserveAspectRatio="none" className={className} aria-hidden="true">
      <path d="M0 40 C 80 10 140 55 220 30 S 340 5 400 25" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" opacity="0.18" />
      <path d="M0 40 C 80 10 140 55 220 30 S 340 5 400 25" fill="none" stroke="#F5B942" strokeWidth="1.5" strokeDasharray="5 7" />
    </svg>
  );
}

/** Mini-carte de corridor pour les cartes « trajets populaires ». Courbure dérivée d’une graine. */
export function MiniCorridor({ seed, className }: { seed: number; className?: string }) {
  const c1 = 20 + ((seed * 37) % 40);
  const c2 = 20 + ((seed * 53) % 40);
  const d = `M14 66 C 70 ${c1 + 30}, 110 ${c2}, 186 18`;
  return (
    <svg viewBox="0 0 200 84" className={className} aria-hidden="true">
      <path d={d} fill="none" stroke="#142436" strokeOpacity="0.08" strokeWidth="14" strokeLinecap="round" />
      <path d={d} fill="none" stroke="#0E8F83" strokeWidth="3" strokeLinecap="round" />
      <path d={d} fill="none" stroke="#F5B942" strokeWidth="1.2" strokeDasharray="3 5" />
      <circle cx="14" cy="66" r="6" fill="#F8FAF8" stroke="#0E8F83" strokeWidth="3" />
      <circle cx="186" cy="18" r="6" fill="#F5B942" stroke="#142436" strokeWidth="2.5" />
    </svg>
  );
}

/** Illustration d’état vide : route qui s’arrête avant un horizon. */
export function EmptyRoad({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 140" className={className} aria-hidden="true">
      <circle cx="160" cy="44" r="22" fill="#FDECC4" />
      <path d="M0 104 H220" stroke="#E3E8E4" strokeWidth="2" />
      <path d="M20 132 C 70 120 90 110 130 104" fill="none" stroke="#CDEBE6" strokeWidth="16" strokeLinecap="round" />
      <path d="M20 132 C 70 120 90 110 130 104" fill="none" stroke="#0E8F83" strokeWidth="2" strokeDasharray="5 7" />
      <circle cx="132" cy="104" r="5" fill="#F5B942" />
      <path d="M40 60 l10 -18 l10 18z M64 60 l14 -26 l14 26z" fill="#C9D6E2" opacity="0.7" />
    </svg>
  );
}
