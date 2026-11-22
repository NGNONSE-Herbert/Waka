import Link from 'next/link';
import { ArrowRight, Check, Headset, ShieldCheck, UserCheck } from 'lucide-react';
import type { City } from '@waka/contracts';
import { getI18n } from '@/lib/i18n/server';
import { serverGet } from '@/lib/api-server';
import { FALLBACK_CITIES, POPULAR_CORRIDORS, cityName } from '@/lib/cities';
import { money } from '@/lib/format';
import { SearchForm } from '@/components/search/SearchForm';
import { CanopyCorner, CanopyHero } from '@/components/brand/Illustrations';

async function loadCities(): Promise<City[]> {
  const r = await serverGet<City[] | { items: City[] }>('/v1/cities', { revalidate: 300, withCookies: false });
  if (!r.ok) return FALLBACK_CITIES;
  const list = Array.isArray(r.data) ? r.data : r.data.items;
  return list?.length ? list : FALLBACK_CITIES;
}

const sectionTitle = 'text-[clamp(2rem,3.8vw,3.125rem)] font-extrabold leading-[1.02] tracking-[-0.03em]';
const stepTitle = 'text-[1.375rem] font-extrabold';
const pillLink = 'inline-flex items-center rounded-full font-display font-bold transition duration-200 hover:-translate-y-0.5';

export default async function HomePage() {
  const [{ t, locale }, cities] = await Promise.all([getI18n(), loadCities()]);
  const L = t.landing;
  const notes = [L.corridor1Note, L.corridor2Note, L.corridor3Note, L.corridor4Note];

  return (
    <>
      {/* ─── HERO ─────────────────────────────────────────── */}
      <section className="bg-ivory pb-16 pt-6 lg:pb-[72px] lg:pt-10">
        <div className="container-w flex flex-col gap-10">
          <div className="flex flex-wrap items-center gap-12">
            <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-7">
              <div className="flex flex-col items-start gap-5">
                <p className="animate-fade-up rounded-full bg-green-50 px-4 py-2 text-sm font-bold text-night-800 [animation-delay:.1s]">{L.eyebrow}</p>
                <h1 className="animate-fade-up text-[clamp(2.75rem,5.6vw,4.875rem)] font-extrabold leading-[0.98] tracking-[-0.035em] [animation-delay:.2s]">{L.heroTitle}</h1>
                <p className="max-w-[560px] animate-fade-up text-[clamp(1.0625rem,1.5vw,1.25rem)] text-ink [animation-delay:.32s]">{L.heroSubtitle}</p>
              </div>
              <div id="recherche" className="flex scroll-mt-24 animate-fade-up flex-col gap-4 rounded-[32px] bg-white p-5 shadow-lift [animation-delay:.46s] sm:p-6">
                <h2 className="text-2xl font-extrabold">{L.searchTitle}</h2>
                <SearchForm cities={cities} initial={{ from: 'DLA', to: 'YDE', seats: 1 }} />
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[560px] flex-[1_1_420px]">
              <div className="canopy-pop aspect-[1/1.08] overflow-hidden rounded-[999px_999px_40px_40px] bg-[#E1F0D9]">
                <CanopyHero />
              </div>
              <div className="canopy-float absolute bottom-7 left-0 flex max-w-[250px] flex-col gap-1.5 rounded-[28px_8px_28px_8px] bg-white px-[18px] py-4 shadow-lift">
                <div className="flex items-center justify-between gap-4 text-[0.8125rem] font-semibold text-ink">
                  {L.heroCardLabel}
                  <span className="rounded-full bg-green-50 px-2 py-0.5 text-[0.6875rem] font-bold text-night-800">{t.common.demo}</span>
                </div>
                <p className="font-display text-xl font-extrabold tracking-[-0.02em]">
                  {cityName(cities, 'DLA')} → {cityName(cities, 'YDE')}
                </p>
                <p className="text-[0.9375rem]">
                  <strong>{money(5500, locale)}</strong> <span className="text-ink">{L.heroCardTotal}</span>
                </p>
              </div>
            </div>
          </div>

          <div>
            <ul className="flex flex-wrap gap-3 text-[0.9375rem] font-semibold text-night-900">
              {[
                { icon: ShieldCheck, label: L.trustPayment },
                { icon: UserCheck, label: L.trustDrivers },
                { icon: Headset, label: L.trustHuman },
              ].map(({ icon: Icon, label }) => (
                <li key={label} className="flex flex-[1_1_280px] items-center gap-3 rounded-[28px_8px_28px_8px] bg-green-50 px-5 py-3.5">
                  <Icon className="h-[22px] w-[22px] shrink-0 text-green-500" aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-ink">{L.trustFootnote}</p>
          </div>
        </div>
      </section>

      {/* ─── CORRIDORS ────────────────────────────────────── */}
      <section className="bg-white py-16 lg:py-24" aria-labelledby="corridors-title">
        <div className="container-w flex flex-wrap items-start gap-x-[72px] gap-y-10">
          <div className="canopy-reveal flex min-w-0 flex-[1_1_320px] flex-col gap-3.5">
            <p className="text-[0.9375rem] font-bold text-green-500">{L.corridorsEyebrow}</p>
            <h2 id="corridors-title" className={sectionTitle}>{L.corridorsTitle}</h2>
            <p className="text-lg text-ink">{L.corridorsSubtitle}</p>
          </div>
          <ul className="canopy-reveal flex min-w-0 flex-[2_1_520px] flex-col gap-2.5">
            {POPULAR_CORRIDORS.slice(0, 4).map((c, i) => (
              <li key={`${c.from}-${c.to}`}>
                <Link
                  href={`/recherche?from=${c.from}&to=${c.to}&seats=1`}
                  className="group flex min-h-[84px] items-center justify-between gap-4 rounded-[28px_8px_28px_8px] bg-ivory py-4 pl-6 pr-4 transition hover:bg-green-50 sm:pl-7"
                >
                  <span className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                    <span className="font-display text-2xl font-extrabold tracking-[-0.02em]">
                      {cityName(cities, c.from)} ↔ {cityName(cities, c.to)}
                    </span>
                    <span className="text-ink">{notes[i]}</span>
                  </span>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-night-900 text-white transition group-hover:translate-x-0.5">
                    <ArrowRight className="h-5 w-5" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ─── DEUX FAÇONS ──────────────────────────────────── */}
      <section id="deux-facons" className="scroll-mt-24 bg-white pb-16 lg:pb-24">
        <div className="container-w flex flex-wrap gap-5">
          <article className="canopy-reveal flex min-w-0 flex-[1_1_420px] flex-col items-start gap-4 rounded-[72px_16px_72px_16px] bg-night-900 p-[clamp(1.75rem,4vw,3rem)] text-white">
            <p className="rounded-full bg-night-800 px-3.5 py-1.5 text-sm font-bold text-amber-400">{L.offerBadge}</p>
            <h3 className="text-[clamp(1.75rem,3.2vw,2.5rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">{L.offerTitle}</h3>
            <p className="text-[1.0625rem] text-night-200">{L.offerBody}</p>
            <ul className="flex flex-col gap-2.5 text-[0.9375rem]">
              {[L.offerPoint1, L.offerPoint2].map((point) => (
                <li key={point} className="flex gap-2.5">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" strokeWidth={2.4} aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
            <Link href="/conducteur" className={`${pillLink} mt-auto h-[54px] bg-amber-400 px-[26px] text-[1.0625rem] text-night-950`}>
              {L.offerCta}
            </Link>
          </article>
          <article className="canopy-reveal flex min-w-0 flex-[1_1_420px] flex-col items-start gap-4 rounded-[16px_72px_16px_72px] bg-amber-400 p-[clamp(1.75rem,4vw,3rem)] text-night-950">
            <p className="rounded-full bg-night-950 px-3.5 py-1.5 text-sm font-bold text-white">{L.seekBadge}</p>
            <h3 className="text-[clamp(1.75rem,3.2vw,2.5rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">{L.seekTitle}</h3>
            <p className="text-[1.0625rem] text-night-900">{L.seekBody}</p>
            <p className="w-full rounded-[24px_6px_24px_6px] bg-white px-5 py-4 text-[0.9375rem] font-medium">{L.seekExample}</p>
            <Link href="/demande" className={`${pillLink} mt-auto h-[54px] bg-night-950 px-[26px] text-[1.0625rem] text-white`}>
              {L.seekCta}
            </Link>
          </article>
        </div>
      </section>

      {/* ─── PAIEMENT ─────────────────────────────────────── */}
      <section id="paiement" className="scroll-mt-24 bg-green-50 py-16 lg:py-24" aria-labelledby="pay-title">
        <div className="container-w flex flex-col gap-10">
          <div className="canopy-reveal flex max-w-[780px] flex-col gap-3.5">
            <p className="text-[0.9375rem] font-bold text-night-800">{L.payEyebrow}</p>
            <h2 id="pay-title" className="text-[clamp(2.125rem,4.2vw,3.5rem)] font-extrabold leading-none tracking-[-0.035em]">{L.payTitle}</h2>
            <p className="text-lg text-ink">{L.paySubtitle}</p>
          </div>
          <ol className="canopy-reveal grid grid-cols-[repeat(auto-fit,minmax(min(250px,100%),1fr))] gap-4">
            {[
              { title: L.pay1Title, body: L.pay1Body },
              { title: L.pay2Title, body: L.pay2Body },
              { title: L.pay3Title, body: L.pay3Body },
              { title: L.pay4Title, body: L.pay4Body },
            ].map(({ title, body }, i) => {
              const last = i === 3;
              return (
                <li
                  key={title}
                  className={`flex flex-col gap-2.5 p-7 ${i % 2 === 0 ? 'rounded-[48px_12px_48px_12px]' : 'rounded-[12px_48px_12px_48px]'} ${last ? 'bg-night-900 text-white' : 'bg-white'}`}
                >
                  <span className={`grid h-11 w-11 place-items-center rounded-full font-display text-lg font-extrabold ${last ? 'bg-amber-400 text-night-950' : 'bg-night-900 text-amber-400'}`}>{i + 1}</span>
                  <h3 className={stepTitle}>{title}</h3>
                  <p className={`text-[0.9375rem] ${last ? 'text-night-200' : 'text-ink'}`}>{body}</p>
                </li>
              );
            })}
          </ol>
          <div className="canopy-reveal flex flex-wrap items-center justify-between gap-x-8 gap-y-4 rounded-[32px] bg-white p-6 sm:px-8 sm:py-7">
            <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-1.5">
              <h3 className={stepTitle}>{L.payIssueTitle}</h3>
              <p className="text-ink">{L.payIssueBody}</p>
            </div>
            <Link href="/paiement-protege" className="inline-flex min-h-[52px] items-center rounded-full border-2 border-night-900 px-6 py-2 font-bold transition hover:bg-green-50">
              {L.payLearnMore}
            </Link>
          </div>
          <p className="text-sm text-ink">{L.payNote}</p>
        </div>
      </section>

      {/* ─── ÉTAPES + PRIX ────────────────────────────────── */}
      <section id="comment-ca-marche" className="scroll-mt-24 bg-ivory py-16 lg:py-24" aria-labelledby="how-title">
        <div className="container-w flex flex-wrap items-center gap-x-[72px] gap-y-12">
          <div className="canopy-reveal flex min-w-0 flex-[1_1_380px] flex-col gap-[18px] rounded-[72px_16px_72px_16px] bg-white p-7 shadow-lift sm:p-9">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[1.375rem] font-extrabold">{L.priceRoute}</h3>
              <span className="shrink-0 rounded-full bg-green-50 px-3 py-1 text-[0.8125rem] font-bold text-night-800">{L.priceExample}</span>
            </div>
            <dl className="flex flex-col gap-3.5 text-[1.0625rem]">
              <div className="flex justify-between gap-4">
                <dt className="text-ink">{L.priceDriver}</dt>
                <dd className="tabular whitespace-nowrap font-bold">{money(5000, locale)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink">{L.priceFee}</dt>
                <dd className="tabular whitespace-nowrap font-bold">{money(500, locale)}</dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-t-2 border-dotted border-green-200 pt-[18px]">
                <dt className="font-bold">{L.priceTotal}</dt>
                <dd className="tabular whitespace-nowrap font-display text-4xl font-extrabold tracking-[-0.03em]">{money(5500, locale)}</dd>
              </div>
            </dl>
            <p className="text-[0.9375rem] text-ink">{L.priceNote}</p>
          </div>
          <div className="canopy-reveal flex min-w-0 flex-[1_1_460px] flex-col gap-8">
            <div className="flex flex-col gap-3">
              <p className="text-[0.9375rem] font-bold text-green-500">{L.howEyebrow}</p>
              <h2 id="how-title" className={sectionTitle}>{L.howTitle}</h2>
            </div>
            <ol className="flex flex-col gap-[22px]">
              {[
                { title: L.how1Title, body: L.how1Body },
                { title: L.how2Title, body: L.how2Body },
                { title: L.how3Title, body: L.how3Body },
              ].map(({ title, body }, i) => (
                <li key={title} className="flex gap-[18px]">
                  <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-amber-400 font-display text-[1.375rem] font-extrabold text-night-950">{i + 1}</span>
                  <div className="flex flex-col gap-1">
                    <h3 className={stepTitle}>{title}</h3>
                    <p className="text-ink">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ─── APPEL CONDUCTEUR ─────────────────────────────── */}
      <section className="bg-ivory pb-8 md:pb-24">
        <div className="container-w">
          <div className="canopy-reveal relative flex flex-wrap items-center justify-between gap-x-12 gap-y-6 overflow-hidden rounded-[64px_20px_64px_20px] bg-night-900 p-[clamp(2rem,5vw,4rem)] text-white md:rounded-[96px_24px_96px_24px]">
            <CanopyCorner className="absolute bottom-0 right-0 h-auto w-[min(400px,60%)]" />
            <div className="relative flex min-w-0 flex-[1_1_460px] flex-col gap-2.5">
              <h2 className="text-[clamp(1.875rem,3.6vw,2.875rem)] font-extrabold leading-[1.02] tracking-[-0.03em]">{L.ctaTitle}</h2>
              <p className="text-lg text-night-200">{L.ctaBody}</p>
            </div>
            <Link href="/conducteur" className={`${pillLink} relative h-[60px] bg-amber-400 px-[30px] text-lg text-night-950`}>
              {L.offerCta}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
