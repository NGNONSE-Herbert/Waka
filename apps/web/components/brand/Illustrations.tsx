/** Illustrations de la vitrine Canopée : SVG originaux, décoratifs, animés seulement si le système l'autorise. */
export function CanopyHero() {
  return (
    <svg aria-hidden="true" viewBox="0 0 560 600" preserveAspectRatio="xMidYMax slice" className="block h-full w-full">
      <rect width="560" height="600" fill="#E1F0D9" />
      <circle className="canopy-sun" cx="392" cy="176" r="66" fill="#D9F27B" />
      <path className="canopy-bird" d="M300 214 q10 -10 20 0 q10 -10 20 0 M246 246 q7 -7 14 0 q7 -7 14 0" stroke="#123A2A" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M0 330 C80 290 150 280 230 310 C310 340 380 280 460 292 C510 300 540 310 560 306 L560 600 L0 600 Z" fill="#A9D49B" />
      <rect className="canopy-cloud" x="40" y="338" width="300" height="10" rx="5" fill="#FFFFFF" opacity=".55" />
      <rect className="canopy-cloud" x="250" y="362" width="270" height="8" rx="4" fill="#FFFFFF" opacity=".45" />
      <g className="canopy-bob" fill="#58B368">
        <circle cx="40" cy="432" r="70" /><circle cx="130" cy="412" r="62" /><circle cx="222" cy="436" r="74" /><circle cx="322" cy="416" r="66" />
        <circle cx="412" cy="434" r="72" /><circle cx="502" cy="418" r="64" /><circle cx="566" cy="442" r="60" /><rect y="436" width="560" height="164" />
      </g>
      <path d="M170 424 V330 M392 430 V352 M290 416 V366" stroke="#123A2A" strokeWidth="5" strokeLinecap="round" />
      <g className="canopy-sway" fill="#1F7A4C">
        <ellipse cx="170" cy="320" rx="62" ry="24" /><ellipse cx="392" cy="342" rx="50" ry="20" /><ellipse cx="290" cy="360" rx="34" ry="14" />
      </g>
      <g className="canopy-bob-slow" fill="#1F7A4C">
        <circle cx="0" cy="532" r="84" /><circle cx="100" cy="502" r="70" /><circle cx="200" cy="538" r="86" /><circle cx="310" cy="510" r="74" />
        <circle cx="420" cy="536" r="84" /><circle cx="530" cy="508" r="76" /><rect y="540" width="560" height="60" />
      </g>
      <path className="canopy-flow" d="M70 500 C150 460 220 500 300 470 C380 440 430 480 500 450" stroke="#D9F27B" strokeWidth="5" strokeLinecap="round" strokeDasharray="1 13" fill="none" />
      <circle cx="70" cy="500" r="8" fill="#123A2A" stroke="#D9F27B" strokeWidth="4" />
      <circle cx="500" cy="450" r="10" fill="#D9F27B" />
      <g fill="#123A2A">
        <circle cx="60" cy="600" r="72" /><circle cx="190" cy="612" r="66" /><circle cx="330" cy="606" r="76" /><circle cx="470" cy="614" r="72" /><circle cx="570" cy="596" r="56" />
      </g>
    </svg>
  );
}

export function EmptyRoad({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 140" className={className} aria-hidden="true">
      <circle cx="160" cy="44" r="22" fill="#D9F27B" />
      <path d="M0 104 H220" stroke="#D7E3D0" strokeWidth="2" />
      <path d="M20 132 C 70 120 90 110 130 104" fill="none" stroke="#E4EFDD" strokeWidth="16" strokeLinecap="round" />
      <path d="M20 132 C 70 120 90 110 130 104" fill="none" stroke="#1F7A4C" strokeWidth="2" strokeDasharray="5 7" />
      <circle cx="132" cy="104" r="5" fill="#123A2A" />
      <path d="M40 60 l10 -18 l10 18z M64 60 l14 -26 l14 26z" fill="#A9D49B" opacity="0.7" />
    </svg>
  );
}

export function CanopyCorner({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 400 160" className={className}>
      <g fill="#1A5239">
        <circle cx="60" cy="150" r="60" /><circle cx="160" cy="130" r="70" /><circle cx="270" cy="150" r="76" /><circle cx="370" cy="120" r="80" />
      </g>
    </svg>
  );
}
