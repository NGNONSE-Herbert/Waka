'use client';

import { useId, useState } from 'react';
import { cn } from './ui';
import { int } from '@/lib/format';

/**
 * Graphiques SVG légers. Une seule série par graphique (pas de légende nécessaire, le titre la nomme),
 * teinte unique, barres fines à extrémité arrondie ancrées sur la ligne de base, survol + table alternative.
 */

export interface Datum {
  key: string;
  label: string;
  value: number;
  /** Couleur d'état réservée (ex. priorité SÉCURITÉ) — toujours accompagnée d'un libellé. */
  color?: string;
}

const BAR = '#0E8F83';

/** Barres horizontales étiquetées directement : catégories nominales (états, priorités). */
export function BarList({ data, caption, format = int, wide }: { data: Datum[]; caption: string; format?: (n: number) => string; wide?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure className="relative">
      <figcaption className="sr-only">{caption}</figcaption>
      <ul className="space-y-2" aria-hidden>
        {data.map((d) => (
          <li key={d.key} className={cn('grid items-center gap-3 text-[13px]', wide ? 'grid-cols-[minmax(0,15rem)_1fr_auto]' : 'grid-cols-[minmax(0,9.5rem)_1fr_auto]')} title={`${d.label} : ${format(d.value)}`}>
            <span className="truncate text-ink">{d.label}</span>
            <span className="h-2 rounded-full bg-muted">
              <span
                className="block h-2 rounded-full"
                style={{ width: `${d.value === 0 ? 0 : Math.max(2, (d.value / max) * 100)}%`, background: d.color ?? BAR }}
              />
            </span>
            <span className="tnum min-w-8 text-right font-semibold text-text">{format(d.value)}</span>
          </li>
        ))}
      </ul>
      <DataTable caption={caption} data={data} format={format} />
    </figure>
  );
}

/** Colonnes verticales (séries temporelles courtes, ex. départs par jour). */
export function Columns({ data, caption, height = 120, format = int }: { data: Datum[]; caption: string; height?: number; format?: (n: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = Math.max(1, data.length);
  const W = 100;
  const slot = W / n;
  const barW = Math.min(slot * 0.56, 7);
  const plotH = height - 22;
  const h = hover !== null ? data[hover] : undefined;
  return (
    <figure className="relative">
      <figcaption id={id} className="sr-only">{caption}</figcaption>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="h-[120px] w-full overflow-visible" role="img" aria-labelledby={id} onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={W} y1={plotH} y2={plotH} stroke="#E2E7E5" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
        {data.map((d, i) => {
          const bh = d.value === 0 ? 0 : Math.max(1.5, (d.value / max) * (plotH - 8));
          const x = i * slot + (slot - barW) / 2;
          const r = Math.min(barW / 2, 1.6);
          const y = plotH - bh;
          return (
            <g key={d.key}>
              <rect x={i * slot} y={0} width={slot} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
              {bh > 0 ? (
                <path
                  d={`M${x},${plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${plotH} Z`}
                  fill={d.color ?? BAR}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                  pointerEvents="none"
                />
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 grid text-center text-[11px] text-ink-soft" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden>
        {data.map((d) => <span key={d.key} className="truncate">{d.label}</span>)}
      </div>
      {h ? (
        <div className="pointer-events-none absolute -top-2 right-0 rounded-md bg-night px-2 py-1 text-[12px] text-white shadow" aria-hidden>
          {h.label} · <span className="tnum font-semibold">{format(h.value)}</span>
        </div>
      ) : null}
      <DataTable caption={caption} data={data} format={format} />
    </figure>
  );
}

/** Sparkline 2px — tendance seule, valeur courante affichée à côté par l'appelant. */
export function Sparkline({ values, label, className }: { values: number[]; label: string; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 24}`).join(' ');
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={cn('h-8 w-24', className)} role="img" aria-label={`${label} : ${values.map((v) => int(v)).join(', ')}`}>
      <polyline points={pts} fill="none" stroke={BAR} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Barre segmentée (part détenue vs acquise…) avec légende textuelle obligatoire. */
export function SplitBar({ parts, caption }: { parts: { label: string; value: number; color: string }[]; caption: string }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0) || 1;
  return (
    <figure className="relative">
      <figcaption className="sr-only">{caption}</figcaption>
      <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-muted" aria-hidden>
        {parts.map((p) => (p.value > 0 ? <span key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} /> : null))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink">
        {parts.map((p) => (
          <li key={p.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-sm" style={{ background: p.color }} />
            {p.label} <span className="tnum font-medium text-text">{Math.round((p.value / total) * 100)} %</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function DataTable({ caption, data, format }: { caption: string; data: Datum[]; format: (n: number) => string }) {
  return (
    <div className="sr-only">
    <table>
      <caption>{caption}</caption>
      <thead><tr><th scope="col">Catégorie</th><th scope="col">Valeur</th></tr></thead>
      <tbody>{data.map((d) => <tr key={d.key}><th scope="row">{d.label}</th><td>{format(d.value)}</td></tr>)}</tbody>
    </table>
    </div>
  );
}
