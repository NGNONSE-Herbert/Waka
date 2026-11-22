import { ImageResponse } from 'next/og';

/** Icônes PWA PNG générées à la compilation depuis le pictogramme SVG (aucun binaire versionné). */
const FILES = {
  'icon-192.png': { size: 192, pad: 0 },
  'icon-512.png': { size: 512, pad: 0 },
  'maskable-512.png': { size: 512, pad: 0.18 },
  'apple-180.png': { size: 180, pad: 0.06 },
} as const;

type FileName = keyof typeof FILES;

export const dynamic = 'force-static';

export function generateStaticParams() {
  return Object.keys(FILES).map((file) => ({ file }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const spec = FILES[file as FileName];
  if (!spec) return new Response('Not found', { status: 404 });
  const { size, pad } = spec;
  const inner = Math.round(size * (1 - pad * 2));
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0B1F17' }}>
        <svg width={inner} height={inner} viewBox="0 0 38 38">
          <path d="M11 26 C11 16 27 22 27 12" stroke="#D9F27B" strokeWidth="3" strokeLinecap="round" fill="none" />
          <circle cx="11" cy="26" r="3.4" fill="#D9F27B" />
          <circle cx="27" cy="12" r="3.4" fill="#D9F27B" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
