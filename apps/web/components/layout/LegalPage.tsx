import { FileWarning } from 'lucide-react';
import type { LegalDoc } from '@/lib/legal';
import type { Dict } from '@/lib/i18n';

export function LegalPage({ doc, t, children }: { doc: LegalDoc; t: Dict; children?: React.ReactNode }) {
  return (
    <article>
      <header className="relative isolate overflow-hidden bg-night-900 py-14 text-ivory">
        <div className="pattern-ndop absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
        <div className="container-w max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider text-night-900">
            <FileWarning className="h-4 w-4" aria-hidden="true" />
            {t.legal.draft}
          </p>
          <h1 className="mt-5 text-4xl font-extrabold sm:text-5xl">{doc.title}</h1>
          <p className="mt-4 text-lg text-night-200">{doc.intro}</p>
          <p className="mt-3 text-xs text-night-300">{t.legal.updated}</p>
        </div>
      </header>
      <div className="container-w max-w-3xl py-12">
        <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">{t.legal.draftBody}</p>
        {children}
        <div className="mt-10 space-y-10">
          {doc.sections.map((s) => (
            <section key={s.h}>
              <h2 className="text-xl font-extrabold">{s.h}</h2>
              {s.p.map((p) => (
                <p key={p} className="mt-3 leading-relaxed text-ink">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}
