import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  CarFront,
  CheckCircle2,
  Clock,
  Headset,
  Landmark,
  MapPinned,
  Quote,
  Search,
  ShieldCheck,
  Smartphone,
  Ticket,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import type { City } from '@waka/contracts';
import { getI18n } from '@/lib/i18n/server';
import { fmt } from '@/lib/i18n';
import { serverGet } from '@/lib/api-server';
import { FALLBACK_CITIES, POPULAR_CORRIDORS, cityName } from '@/lib/cities';
import { duration, money } from '@/lib/format';
import { SearchForm } from '@/components/search/SearchForm';
import { CorridorHero, MiniCorridor, RoadRibbon } from '@/components/brand/Illustrations';
import { ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Card';

async function loadCities(): Promise<City[]> {
  const r = await serverGet<City[] | { items: City[] }>('/v1/cities', { revalidate: 300, withCookies: false });
  if (!r.ok) return FALLBACK_CITIES;
  const list = Array.isArray(r.data) ? r.data : r.data.items;
  return list?.length ? list : FALLBACK_CITIES;
}

export default async function HomePage() {
  const [{ t, locale }, cities] = await Promise.all([getI18n(), loadCities()]);
  const L = t.landing;

  return (
    <>
      {/* ─── HERO ─────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden bg-night-900 text-ivory">
        <div className="pattern-ndop absolute inset-0 -z-10 opacity-70" aria-hidden="true" />
        <div className="absolute -right-40 -top-40 -z-10 h-[34rem] w-[34rem] rounded-full bg-green-500/25 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-56 -left-24 -z-10 h-[30rem] w-[30rem] rounded-full bg-amber-400/15 blur-3xl" aria-hidden="true" />

        <div className="container-w grid items-center gap-10 pb-36 pt-12 md:pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:pb-44 lg:pt-20">
          <div className="animate-fade-up">
            <p className="eyebrow inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-amber-300 ring-1 ring-white/10">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-amber-400" aria-hidden="true" />
              {L.eyebrow}
            </p>
            <h1 className="mt-5 text-[2.9rem] font-extrabold leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-[5.2rem]">
              {L.heroTitle.split(' ').slice(0, -1).join(' ')}{' '}
              <span className="relative whitespace-nowrap text-amber-400">
                {L.heroTitle.split(' ').slice(-1)}
                <svg viewBox="0 0 200 20" className="absolute -bottom-2 left-0 h-3 w-full" aria-hidden="true" preserveAspectRatio="none">
                  <path d="M2 14 C 50 2, 120 22, 198 6" fill="none" stroke="#0E8F83" strokeWidth="5" strokeLinecap="round" className="route-draw" style={{ ['--len' as string]: 220 }} />
                </svg>
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-night-200">{L.heroSubtitle}</p>
          </div>

          <div className="relative hidden lg:block" aria-hidden="true">
            <CorridorHero className="w-full" fromLabel="Douala" toLabel="Yaoundé" midLabel="Édéa" />
            {/* Carte flottante d’exemple */}
            <div className="absolute bottom-2 right-0 w-72 rotate-[-2deg] rounded-3xl bg-white/[0.07] p-5 shadow-2xl ring-1 ring-white/15 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <span className="eyebrow text-night-300">{L.heroCardLabel}</span>
                <Badge tone="demo">{t.common.demo}</Badge>
              </div>
              <div className="mt-3 flex items-baseline gap-2 font-display text-2xl font-extrabold">
                08:00 <ArrowRight className="h-4 w-4 text-amber-400" /> 12:00
              </div>
              <p className="mt-1 text-sm text-night-200">{L.heroCardMeeting}</p>
              <div className="mt-4 rounded-2xl bg-night-950/60 p-3">
                <p className="text-xs text-night-300">{L.heroCardTotal}</p>
                <p className="font-display text-2xl font-extrabold text-amber-400">{money(5500, locale)}</p>
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-green-300">
                <ShieldCheck className="h-3.5 w-3.5" /> {L.heroCardStatus}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── RECHERCHE + RUBAN DE CONFIANCE ────────────────── */}
      <section className="container-w relative z-10 -mt-28 lg:-mt-32" aria-labelledby="search-title">
        <div className="rounded-[2rem] bg-white p-4 shadow-lift ring-1 ring-line sm:p-6">
          <h2 id="search-title" className="mb-4 flex items-center gap-2 text-lg font-extrabold text-night-900">
            <Search className="h-5 w-5 text-green-600" aria-hidden="true" />
            {L.heroTitle}
          </h2>
          <SearchForm cities={cities} />
        </div>

        <ul className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { icon: Landmark, label: L.trustPayment },
            { icon: BadgeCheck, label: L.trustDrivers },
            { icon: Headset, label: L.trustHuman },
          ].map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-line/70">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-green-50 text-green-700">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold text-night-900">{label}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-ink">{L.trustFootnote}</p>
      </section>

      {/* ─── DEUX ENTRÉES ─────────────────────────────────── */}
      <section className="container-w mt-20" aria-labelledby="entry-title">
        <p className="eyebrow text-green-700">{L.entryEyebrow}</p>
        <h2 id="entry-title" className="sr-only">
          {L.entryEyebrow}
        </h2>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <Link
            href="/conducteur"
            className="group relative isolate overflow-hidden rounded-[2rem] bg-night-900 p-7 text-ivory shadow-lift transition hover:-translate-y-0.5 sm:p-9"
          >
            <div className="pattern-dots absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
            <RoadRibbon className="absolute -right-10 bottom-6 -z-10 h-24 w-[130%] text-green-400" />
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-400 text-night-900">
              <CarFront className="h-7 w-7" aria-hidden="true" />
            </span>
            <h3 className="mt-6 text-3xl font-extrabold">{L.offerTitle}</h3>
            <p className="mt-3 max-w-md leading-relaxed text-night-200">{L.offerBody}</p>
            <span className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-amber-400 px-5 font-display font-bold text-night-900 transition group-hover:gap-3">
              {L.offerCta} <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </span>
          </Link>
          <Link
            href="/demande"
            className="group relative isolate overflow-hidden rounded-[2rem] bg-green-50 p-7 text-night-900 ring-1 ring-green-100 transition hover:-translate-y-0.5 hover:shadow-lift sm:p-9"
          >
            <div className="pattern-ndop-light absolute inset-0 -z-10" aria-hidden="true" />
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-green-600 text-white">
              <MapPinned className="h-7 w-7" aria-hidden="true" />
            </span>
            <h3 className="mt-6 text-3xl font-extrabold">{L.seekTitle}</h3>
            <p className="mt-3 max-w-md leading-relaxed text-ink">{L.seekBody}</p>
            <span className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-green-600 px-5 font-display font-bold text-white transition group-hover:gap-3">
              {L.seekCta} <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </span>
          </Link>
        </div>
      </section>

      {/* ─── CORRIDORS POPULAIRES ─────────────────────────── */}
      <section className="container-w mt-24" aria-labelledby="corridors-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-green-700">{L.corridorsEyebrow}</p>
            <h2 id="corridors-title" className="mt-2 text-3xl font-extrabold sm:text-4xl">
              {L.corridorsTitle}
            </h2>
            <p className="mt-2 max-w-xl text-ink">{L.corridorsSubtitle}</p>
          </div>
        </div>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {POPULAR_CORRIDORS.map((c, i) => (
            <li key={`${c.from}-${c.to}`} className={i === 0 ? 'sm:col-span-2 lg:col-span-1' : ''}>
              <Link
                href={`/recherche?from=${c.from}&to=${c.to}&seats=1`}
                className="group flex h-full flex-col rounded-3xl bg-white p-5 shadow-card ring-1 ring-line/70 transition hover:-translate-y-1 hover:shadow-lift"
              >
                <MiniCorridor seed={i + 2} className="h-20 w-full" />
                <div className="mt-3 flex flex-wrap items-center gap-x-2 font-display text-lg font-extrabold leading-tight">
                  {cityName(cities, c.from)}
                  <ArrowRight className="h-4 w-4 text-green-600" aria-hidden="true" />
                  {cityName(cities, c.to)}
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-ink">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {fmt(L.corridorDuration, { d: duration(c.durationMin) })}
                </p>
                <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-bold text-green-700 group-hover:gap-2">
                  {L.corridorSee} <ArrowRight className="h-4 w-4 transition-all" aria-hidden="true" />
                </span>
              </Link>
              <Link
                href={`/recherche?from=${c.to}&to=${c.from}&seats=1`}
                className="mt-1 inline-flex min-h-10 items-center gap-1 px-2 text-xs font-semibold text-ink hover:text-green-700"
              >
                {cityName(cities, c.to)} → {cityName(cities, c.from)}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ─── COMMENT ÇA MARCHE ────────────────────────────── */}
      <section id="comment-ca-marche" className="container-w mt-24 scroll-mt-24" aria-labelledby="how-title">
        <p className="eyebrow text-green-700">{L.howEyebrow}</p>
        <h2 id="how-title" className="mt-2 text-3xl font-extrabold sm:text-4xl">
          {L.howTitle}
        </h2>
        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {[
            { icon: Search, title: L.how1Title, body: L.how1Body },
            { icon: Smartphone, title: L.how2Title, body: L.how2Body },
            { icon: Ticket, title: L.how3Title, body: L.how3Body },
          ].map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="relative rounded-3xl bg-white p-7 shadow-card ring-1 ring-line/70">
              <span className="absolute right-6 top-4 font-display text-7xl font-extrabold leading-none text-green-50" aria-hidden="true">
                {i + 1}
              </span>
              <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-night-900 text-amber-400">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <h3 className="relative mt-5 text-xl font-extrabold">{title}</h3>
              <p className="relative mt-2 leading-relaxed text-ink">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ─── PAIEMENT PROTÉGÉ : FRISE ANIMÉE ──────────────── */}
      <section className="relative isolate mt-24 overflow-hidden bg-night-900 py-20 text-ivory" aria-labelledby="pay-title">
        <div className="pattern-ndop absolute inset-0 -z-10 opacity-50" aria-hidden="true" />
        <div className="absolute left-1/2 top-0 -z-10 h-72 w-[48rem] -translate-x-1/2 rounded-full bg-green-500/20 blur-3xl" aria-hidden="true" />
        <div className="container-w">
          <p className="eyebrow text-amber-300">{L.payEyebrow}</p>
          <h2 id="pay-title" className="mt-2 max-w-3xl text-3xl font-extrabold sm:text-5xl">
            {L.payTitle}
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-night-200">{L.paySubtitle}</p>

          <ol className="relative mt-12 grid gap-6 lg:grid-cols-4 lg:gap-4">
            {/* ligne de progression */}
            <div className="absolute bottom-6 left-[1.6rem] top-6 w-0.5 bg-night-700 lg:bottom-auto lg:left-8 lg:right-8 lg:top-[1.6rem] lg:h-0.5 lg:w-auto" aria-hidden="true">
              <div className="h-full w-full origin-top animate-[grow-y_3s_ease-out_both] bg-gradient-to-b from-green-400 to-amber-400 lg:origin-left lg:animate-[grow-x_3s_ease-out_both] lg:bg-gradient-to-r" />
            </div>
            {[
              { icon: Smartphone, title: L.pay1Title, body: L.pay1Body },
              { icon: Landmark, title: L.pay2Title, body: L.pay2Body },
              { icon: CheckCircle2, title: L.pay3Title, body: L.pay3Body },
              { icon: Wallet, title: L.pay4Title, body: L.pay4Body },
            ].map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="relative flex gap-4 lg:block" style={{ animationDelay: `${0.25 + i * 0.5}s` }}>
                <span
                  className="relative z-10 grid h-[3.2rem] w-[3.2rem] shrink-0 place-items-center rounded-2xl bg-night-800 text-amber-400 ring-4 ring-night-900 animate-fade-up"
                  style={{ animationDelay: `${0.2 + i * 0.6}s` }}
                >
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <div className="animate-fade-up lg:mt-5 lg:pr-4" style={{ animationDelay: `${0.35 + i * 0.6}s` }}>
                  <p className="font-display text-xs font-bold text-night-300">0{i + 1}</p>
                  <h3 className="text-xl font-extrabold">{title}</h3>
                  <p className="mt-1 text-night-200">{body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-10 flex flex-col gap-4 rounded-3xl bg-amber-400/10 p-6 ring-1 ring-amber-400/30 sm:flex-row sm:items-start">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-400 text-night-900">
              <TriangleAlert className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-lg font-extrabold text-amber-300">{L.payIssueTitle}</h3>
              <p className="mt-1 max-w-3xl text-night-200">{L.payIssueBody}</p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <ButtonLink href="/paiement-protege" variant="amber">
              {L.payLearnMore} <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </ButtonLink>
            <p className="text-xs text-night-300">{L.payNote}</p>
          </div>
        </div>
      </section>

      {/* ─── TÉMOIGNAGES FICTIFS (signalés) ───────────────── */}
      <section className="container-w mt-24" aria-labelledby="testi-title">
        <div className="flex flex-wrap items-center gap-3">
          <p className="eyebrow text-green-700">{L.testimonialsEyebrow}</p>
          <Badge tone="demo">{L.testimonialsLabel}</Badge>
        </div>
        <h2 id="testi-title" className="sr-only">
          {L.testimonialsEyebrow} — {L.testimonialsLabel}
        </h2>
        <ul className="mt-6 grid gap-5 md:grid-cols-3">
          {[
            { q: L.t1Quote, n: L.t1Name },
            { q: L.t2Quote, n: L.t2Name },
            { q: L.t3Quote, n: L.t3Name },
          ].map(({ q, n }) => (
            <li key={n}>
              <figure className="flex h-full flex-col rounded-3xl bg-white p-7 ring-1 ring-line/70">
                <Quote className="h-7 w-7 text-amber-400" aria-hidden="true" />
                <blockquote className="mt-4 flex-1 text-lg font-medium leading-relaxed text-night-900">{q}</blockquote>
                <figcaption className="mt-5 text-sm font-semibold text-ink">
                  {n} · <span className="text-amber-800">{t.common.demo}</span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </section>

      {/* ─── CTA ──────────────────────────────────────────── */}
      <section className="container-w my-24">
        <div className="relative isolate overflow-hidden rounded-[2.5rem] bg-green-600 px-7 py-12 text-white sm:px-12">
          <div className="pattern-ndop absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
          <RoadRibbon className="absolute -bottom-4 left-0 -z-10 h-28 w-full text-night-900" />
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <h2 className="text-3xl font-extrabold sm:text-4xl">{L.ctaTitle}</h2>
              <p className="mt-2 text-green-50">{L.ctaBody}</p>
            </div>
            <ButtonLink href="/recherche" variant="amber" size="lg">
              <Search className="h-5 w-5" aria-hidden="true" />
              {t.nav.findTrip}
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
