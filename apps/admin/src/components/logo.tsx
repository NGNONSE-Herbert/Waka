/** Pictogramme provisoire : deux sièges reliés par une route + mot-symbole « waka ». */
export function Logo({ onDark = false, compact = false }: { onDark?: boolean; compact?: boolean }) {
  const ink = onDark ? '#F8FAF8' : '#142436';
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden focusable="false">
        <rect x="1" y="1" width="30" height="30" rx="9" fill={onDark ? '#1B2F45' : '#142436'} />
        <path d="M9 21 C 13 21, 13 12, 23 12" stroke="#F5B942" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeDasharray="0.1 4" />
        <rect x="5.5" y="17" width="7" height="8" rx="2.4" fill="#0E8F83" />
        <rect x="19.5" y="7" width="7" height="8" rx="2.4" fill="#0E8F83" />
      </svg>
      {compact ? null : (
        <span className="font-display text-[19px] font-extrabold lowercase tracking-tight" style={{ color: ink }}>
          waka
        </span>
      )}
    </span>
  );
}
