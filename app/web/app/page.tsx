'use client'

import Link from 'next/link'
import { useRef, useState, type TouchEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

/* BeActive landing — "natural / editorial" direction (ref: Be active concept).
   Serif display headline (Fraunces), muted forest-green accents kept LOCAL to this
   page, organic leaf illustrations, a phone + floating stat cards, a vertical
   hairline split, and a full-width footer.

   Desktop (lg+) and mobile (<lg) are DIFFERENT journeys, not one responsive layout:
   - Desktop: two panels side-by-side (storytelling LEFT, auth RIGHT) — see <DesktopLanding>.
   - Mobile: a purpose-built two-screen app (Discovery → Auth) with a native-feeling
     spring slide transition and swipe/back navigation — see <MobileLanding>.
   The marketing pieces (Logo, Composition) and the auth surface (<AuthPanel>) are
   shared so the two journeys never diverge.

   Honest divergences from the reference:
   - No Apple/Google social logins — BeActive has no OAuth. Email-only auth, styled
     like the ref (button stack + divider). The circle row below the divider is a
     product-pillar trio, not fake providers.
   - No sun/theme toggle (no dark mode exists — a dead toggle would mislead).
   - No carousel dots (there is no carousel).
   The hero photo is a PLACEHOLDER — swap HERO_PHOTO when the forest/runner shot lands. */

const HERO_PHOTO = '/sample-workout.jpg' // ponytail: placeholder; one-line swap when the real image arrives

const LEAF_OUTLINE = 'M5.5 18.5C10 15 14.5 10.5 18 6' // vein
const LEAF_BODY = 'M4.5 19.5C4.5 11 11 4.5 19.5 4.5c0 8.5-6.5 15-15 15z'
const LEAF_FILL = 'M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z'

function LeafOutline({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={LEAF_BODY} />
      <path d={LEAF_OUTLINE} />
    </svg>
  )
}

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <LeafOutline className="w-[33px] h-[33px] text-[#4f7a3c]" />
      <span className="font-serif text-[24px] font-medium tracking-tight text-[#1d2b22]">Be active</span>
    </div>
  )
}

/* ── floating stat card ── */
function StatCard({ className = '', icon, label, value, sub }: { className?: string; icon: string; label: string; value: string; sub: string }) {
  return (
    <div className={`absolute rounded-2xl bg-white border border-black/[0.05] shadow-[0_14px_40px_-14px_rgba(40,70,30,0.25)] px-4 py-3 text-center ${className}`}>
      <svg viewBox="0 0 24 24" className="w-5 h-5 mx-auto text-[#6f9355]" fill="currentColor" aria-hidden><path d={icon} /></svg>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-[20px] font-bold leading-tight text-[#1d2b22]">{value}</p>
      <p className="text-[10px] text-gray-400 leading-tight">{sub}</p>
    </div>
  )
}

/* Bounded composition — phone + cards anchored INSIDE the box so nothing clips. */
function Composition() {
  return (
    <div className="relative mx-auto w-[400px] h-[356px] max-w-full origin-top scale-[0.82] sm:scale-90 lg:scale-100">
      {/* soft sage disc */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-[#e9f0e0]" aria-hidden />
      {/* organic leaves */}
      <svg className="absolute -left-2 bottom-6 w-28 h-28 text-[#bcd4a3] -rotate-[20deg]" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d={LEAF_FILL} /></svg>
      <svg className="absolute right-0 bottom-10 w-24 h-24 text-[#a9c98e] rotate-[160deg]" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d={LEAF_FILL} /></svg>
      <svg className="absolute right-8 top-2 w-16 h-16 text-[#cbe0b4] rotate-[30deg]" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d={LEAF_FILL} /></svg>

      {/* phone — flagship device mockup (titanium rail → black bezel → screen) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[168px] h-[332px]">
        {/* titanium rail */}
        <div className="relative w-full h-full rounded-[2.1rem] bg-gradient-to-br from-[#3a3a3c] via-[#1d1d1f] to-[#2c2c2e] p-[2.5px] shadow-[0_30px_70px_-28px_rgba(30,50,20,0.5),0_10px_28px_-14px_rgba(0,0,0,0.55)]">
          {/* metallic edge highlight */}
          <div className="pointer-events-none absolute inset-0 rounded-[2.1rem] opacity-50 mix-blend-overlay [background:linear-gradient(135deg,rgba(255,255,255,0.55),transparent_22%,transparent_78%,rgba(255,255,255,0.3))]" aria-hidden />
          {/* black bezel */}
          <div className="relative h-full w-full rounded-[1.95rem] bg-black p-[2px]">
            {/* screen */}
            <div className="relative h-full w-full overflow-hidden rounded-[1.8rem] bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={HERO_PHOTO} alt="A member's daily workout proof" className="h-full w-full object-cover" />
              {/* bottom legibility gradient */}
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/35 to-transparent" aria-hidden />
              {/* glass sheen */}
              <div className="pointer-events-none absolute inset-0 [background:linear-gradient(115deg,rgba(255,255,255,0.16),transparent_38%)]" aria-hidden />
              {/* Dynamic Island */}
              <div className="absolute left-1/2 top-[9px] flex h-[15px] w-[52px] -translate-x-1/2 items-center justify-end rounded-full bg-black pr-[6px] shadow-[0_1px_2px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.06]" aria-hidden>
                {/* front camera lens */}
                <span className="relative h-[5px] w-[5px] rounded-full bg-[#0b0b10] ring-[0.5px] ring-white/15">
                  <span className="absolute right-[0.5px] top-[0.5px] h-[1.5px] w-[1.5px] rounded-full bg-sky-300/50" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* floating cards — anchored inside the box */}
      <StatCard className="top-2 right-0 w-[112px]" icon="M16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11zM7 10h5v5H7z" label="This week" value="6 of 7" sub="on track" />
      <StatCard className="top-1/2 -translate-y-1/2 left-0 w-[112px]" icon={LEAF_FILL} label="Day streak" value="42" sub="days strong" />
      <StatCard className="bottom-1 right-2 w-[120px]" icon="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" label="Today" value="Locked" sub="in today" />
    </div>
  )
}

const PILLARS = [
  { label: 'Daily proof', path: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM9 2 7.17 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3.17L15 2H9z' },
  { label: 'Grow a streak', path: LEAF_FILL },
  { label: 'With friends', path: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' },
]

const FOOTER_LINKS = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
]

/* ── shared auth surface (email-only, styled like the ref; no OAuth) ── */
function AuthPanel() {
  return (
    <div className="w-full max-w-sm flex flex-col items-center text-center">
      <span className="w-[104px] h-[104px] rounded-full bg-[#eef3e8] grid place-items-center">
        <LeafOutline className="w-12 h-12 text-[#4f7a3c]" />
      </span>
      <h2 className="mt-5 font-serif text-[34px] font-normal tracking-tight">Be active</h2>
      <p className="mt-1.5 text-[14px] text-gray-500">A streak you’ll want to protect — every day.</p>

      <div className="mt-7 w-full space-y-3">
        <Link href="/signup" className="flex items-center justify-center w-full min-h-[52px] rounded-full bg-[#4f7a3c] text-white font-semibold text-[15px] shadow-[0_10px_26px_-10px_rgba(50,90,30,0.6)] hover:bg-[#406331] active:scale-[0.99] transition-all">
          Start your streak
        </Link>
        <Link href="/login" className="flex items-center justify-center w-full min-h-[52px] rounded-full border border-gray-200 text-[#1d2b22] font-semibold text-[15px] hover:border-[#bcd4a3] hover:bg-[#f4f7f0] active:scale-[0.99] transition-all">
          I already have an account
        </Link>
      </div>

      {/* divider */}
      <div className="mt-7 w-full flex items-center gap-3 text-gray-400">
        <span className="h-px flex-1 bg-gray-200" />
        <span className="text-[12px]">what you get</span>
        <span className="h-px flex-1 bg-gray-200" />
      </div>

      {/* pillar circles (product facts, not providers) */}
      <ul className="mt-5 flex items-start justify-center gap-7">
        {PILLARS.map((p) => (
          <li key={p.label} className="flex flex-col items-center gap-2 w-16">
            <span className="w-12 h-12 rounded-full border border-[#dfe8d3] bg-white grid place-items-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#4f7a3c]" fill="currentColor" aria-hidden><path d={p.path} /></svg>
            </span>
            <span className="text-[11px] font-medium text-gray-500 leading-tight">{p.label}</span>
          </li>
        ))}
      </ul>

      <p className="mt-7 text-[12px] text-gray-400 leading-relaxed">
        By continuing, you agree to our{' '}
        <Link href="/terms" className="text-[#4f7a3c] hover:underline">Terms of Service</Link> and{' '}
        <Link href="/privacy" className="text-[#4f7a3c] hover:underline">Privacy Policy</Link>.
      </p>
    </div>
  )
}

/* ── DESKTOP (lg+) — the original dual-panel layout, unchanged ── */
function DesktopLanding() {
  return (
    <div className="hidden lg:flex lg:flex-1 lg:flex-col">
      <div className="flex-1 grid grid-cols-2">
        {/* LEFT · sell */}
        <section className="relative flex flex-col px-6 sm:px-12 lg:px-16 py-6 lg:py-6 bg-[#fafbf7] lg:border-r lg:border-[#ece9e1] overflow-hidden">
          <header className="shrink-0">
            <Logo />
          </header>

          <div className="flex-1 min-h-0 flex flex-col justify-center gap-7 py-6">
            <div className="max-w-lg lg:ml-6">
              <h1 className="font-serif text-[2.25rem] sm:text-5xl font-light tracking-tight leading-[1.04]">
                Small steps.<br />
                Every day.<br />
                <span className="text-[#6f9355] italic">Momentum that lasts.</span>
              </h1>
              <p className="mt-4 text-[13px] text-gray-500 leading-relaxed max-w-sm">
                Your daily companion for movement, consistency, and the friends who keep you going.
              </p>
            </div>
            <Composition />
          </div>
        </section>

        {/* RIGHT · convert */}
        <section className="flex flex-col items-center justify-center px-6 sm:px-12 py-12 lg:py-9">
          <AuthPanel />
        </section>
      </div>

      {/* full-width footer */}
      <footer className="border-t border-[#ece9e1] bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex flex-col items-center gap-1.5 text-[12px] text-gray-400">
          <nav className="flex items-center gap-6">
            {FOOTER_LINKS.map((l) => (
              <Link key={l.label} href={l.href} className="hover:text-[#4f7a3c]">{l.label}</Link>
            ))}
          </nav>
          <p>© 2026 Be active</p>
        </div>
      </footer>
    </div>
  )
}

/* ── MOBILE (<lg) — purpose-built two-screen app ──
   One horizontal track, two full-viewport screens. The track translates between
   them with an iOS-style spring; the off-screen pane is `inert` so it can't be
   tapped or tab-focused. Discovery → Auth via the CTA / "Log in"; Auth → Discovery
   via the back button OR a right-swipe. Transforms only → 60fps, zero layout shift. */
function MobileLanding() {
  const [screen, setScreen] = useState<0 | 1>(0)
  const reduce = useReducedMotion()
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const transition = reduce
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 360, damping: 36, mass: 0.9 }

  // Right-swipe on the auth screen returns to discovery — horizontal intent only,
  // so it never hijacks a vertical scroll on small devices.
  const onTouchStart = (e: TouchEvent<HTMLElement>) => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: TouchEvent<HTMLElement>) => {
    const s = touchStart.current
    if (!s) return
    const t = e.changedTouches[0]
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    if (dx > 70 && Math.abs(dx) > Math.abs(dy) * 1.4) setScreen(0)
    touchStart.current = null
  }

  return (
    <div className="lg:hidden h-dvh w-full overflow-hidden bg-white">
      <motion.div
        className="flex h-full w-full will-change-transform"
        animate={{ x: screen === 0 ? '0%' : '-100%' }}
        transition={transition}
      >
        {/* ── Screen 1 · Discovery ── */}
        <section
          aria-label="Welcome to BeActive"
          aria-hidden={screen !== 0}
          inert={screen !== 0}
          className="flex h-full w-full shrink-0 flex-col bg-[#fafbf7] px-6"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 1.1rem)', paddingBottom: 'max(env(safe-area-inset-bottom), 1.1rem)' }}
        >
          <header className="mx-auto flex w-full max-w-md shrink-0 items-center justify-between">
            <Logo />
            <button
              type="button"
              onClick={() => setScreen(1)}
              className="rounded-full px-3 py-2 text-[14px] font-semibold text-[#4f7a3c] transition-colors active:bg-[#4f7a3c]/10"
            >
              Log in
            </button>
          </header>

          <div className="mx-auto flex w-full max-w-md min-h-0 flex-1 flex-col justify-center gap-5">
            <div>
              <h1 className="font-serif text-[2.5rem] font-light leading-[1.05] tracking-tight [@media(max-height:700px)]:text-[2.05rem]">
                Small steps.<br />
                Every day.<br />
                <span className="text-[#6f9355] italic">Momentum that lasts.</span>
              </h1>
              <p className="mt-3 max-w-xs text-[14px] leading-relaxed text-gray-500">
                Your daily companion for movement, consistency, and the friends who keep you going.
              </p>
            </div>
            {/* reclaim the dead layout space transform-scale leaves below the mock
                (box 356px, visual 356*scale) so the centered block fits short screens */}
            <div className="flex shrink-0 justify-center -mb-[64px] sm:-mb-[40px]">
              <Composition />
            </div>
          </div>

          <div className="mx-auto w-full max-w-md shrink-0">
            <button
              type="button"
              onClick={() => setScreen(1)}
              className="flex w-full items-center justify-center min-h-[54px] rounded-full bg-[#4f7a3c] text-[16px] font-semibold text-white shadow-[0_14px_30px_-12px_rgba(50,90,30,0.7)] transition-transform active:scale-[0.98]"
            >
              Get started
            </button>
            <p className="mt-3 text-center text-[12px] text-gray-400">Free to start · Your streak begins today</p>
          </div>
        </section>

        {/* ── Screen 2 · Auth ── */}
        <section
          aria-label="Create your account or sign in"
          aria-hidden={screen !== 1}
          inert={screen !== 1}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className="flex h-full w-full shrink-0 flex-col bg-white px-6"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 0.6rem)', paddingBottom: 'max(env(safe-area-inset-bottom), 1.25rem)' }}
        >
          <header className="mx-auto flex w-full max-w-md shrink-0 items-center">
            <button
              type="button"
              onClick={() => setScreen(0)}
              aria-label="Back to overview"
              className="-ml-1 flex items-center gap-0.5 rounded-full py-2 pl-1 pr-3 text-[15px] font-medium text-[#1d2b22] transition-colors active:bg-black/5"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Back
            </button>
          </header>
          <div className="mx-auto flex w-full max-w-md min-h-0 flex-1 flex-col justify-center overflow-y-auto py-4">
            <AuthPanel />
          </div>
        </section>
      </motion.div>
    </div>
  )
}

export default function LandingPage() {
  return (
    <main className="min-h-dvh flex flex-col bg-white text-[#1d2b22]">
      <DesktopLanding />
      <MobileLanding />
    </main>
  )
}
