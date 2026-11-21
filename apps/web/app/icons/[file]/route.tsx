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
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#142436' }}>
        <svg width={inner} height={inner} viewBox="0 0 48 48">
          <rect width="48" height="48" rx={pad > 0 ? 0 : 14} fill="#142436" />
          <path d="M15 27.5c8 0 7.5-9 18-9" fill="none" stroke="#0E8F83" strokeWidth="5.5" strokeLinecap="round" />
          <path d="M15 27.5c8 0 7.5-9 18-9" fill="none" stroke="#F5B942" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2.2 2.8" />
          <path d="M8.5 15.5a2.5 2.5 0 0 1 5 0v9h3.5a2.5 2.5 0 0 1 0 5h-6a2.5 2.5 0 0 1-2.5-2.5z" fill="#F8FAF8" />
          <path d="M39.5 32.5a2.5 2.5 0 0 1-5 0v-9H31a2.5 2.5 0 0 1 0-5h6a2.5 2.5 0 0 1 2.5 2.5z" fill="#F5B942" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
