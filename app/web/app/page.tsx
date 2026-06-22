import Link from 'next/link'

/* BeActive landing — "Quiet Momentum", viewport-locked.
   Split-screen that fits a laptop viewport with zero scroll:
   - left column = full-height flex (nav row → centered headline + compact,
     fully-bounded composition). No absolute logo, no card bleed.
   - right column = calm single-CTA entry.
   White + sage/forest, no stock photos, email-only auth (no fake OAuth). */

const SAGE_STAGE = '#f4f7f3'

function StreakRing() {
  const SIZE = 96, R = 40, STROKE = 7
  const CIRC = 2 * Math.PI * R
  const pct = 0.62
  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} className="-rotate-90">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#e3ece1" strokeWidth={STROKE} />
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="url(#ring)" strokeWidth={STROKE} strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct)} />
        <defs><linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4ade80" /><stop offset="1" stopColor="#15803d" /></linearGradient></defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg leading-none animate-breathe">🌿</span>
        <span className="text-[28px] font-bold text-gray-900 leading-none mt-0.5 tracking-tight tabular-nums">42</span>
        <span className="text-[8px] font-semibold uppercase tracking-widest text-gray-400 mt-0.5">day streak</span>
      </div>
    </div>
  )
}

function FloatCard({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`absolute rounded-2xl bg-white/95 backdrop-blur-sm border border-black/[0.04] shadow-[0_12px_36px_-12px_rgba(20,80,40,0.2)] ${className}`}>
      {children}
    </div>
  )
}

/* Fully bounded 340×330 stage — every card sits INSIDE the box (anchored to its
   edges), so nothing clips the viewport. scale-90 on phones keeps it < 360px wide. */
function Composition() {
  return (
    <div className="relative mx-auto w-[340px] h-[330px] origin-top scale-90 sm:scale-100">
      {/* organic sage glow + leaf — behind, never interactive */}
      <div className="absolute top-2 left-6 w-56 h-56 rounded-full bg-brand-200/45 blur-3xl" aria-hidden />
      <div className="absolute bottom-2 right-6 w-48 h-48 rounded-full bg-brand-300/30 blur-3xl" aria-hidden />
      <svg className="absolute bottom-3 left-2 w-20 h-20 text-brand-400/30 -rotate-12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z"/></svg>

      {/* center — today's card */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[186px] rounded-3xl bg-white border border-black/[0.05] shadow-[0_22px_60px_-22px_rgba(20,80,40,0.28)] px-5 py-5 flex flex-col items-center">
        <StreakRing />
        <div className="mt-3 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500" aria-hidden />
          <span className="text-[12px] font-semibold text-brand-700">Locked in today</span>
        </div>
        <div className="mt-2.5 flex gap-1" aria-hidden>
          {[1, 1, 1, 1, 1, 1, 0].map((on, i) => (
            <span key={i} className={`w-4 h-1.5 rounded-full ${on ? 'bg-brand-400' : 'bg-gray-200'}`} />
          ))}
        </div>
      </div>

      {/* top-right — weekly progress (inside box) */}
      <FloatCard className="top-0 right-0 w-[128px] p-3">
        <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">This week</p>
        <p className="text-[19px] font-bold text-gray-900 leading-tight">6 of 7</p>
        <div className="mt-1.5 flex items-end gap-0.5 h-6" aria-hidden>
          {[5, 7, 4, 6, 7, 7, 2].map((h, i) => (
            <span key={i} className="flex-1 rounded-sm bg-gradient-to-t from-brand-200 to-brand-400" style={{ height: `${h * 12}%` }} />
          ))}
        </div>
      </FloatCard>

      {/* bottom-left — friend cheer (inside box) */}
      <FloatCard className="bottom-0 left-0 w-[154px] p-2.5 flex items-center gap-2">
        <span className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 grid place-items-center text-white text-xs font-bold shrink-0">M</span>
        <div className="min-w-0">
          <p className="text-[11.5px] font-semibold text-gray-900 leading-tight">Maya cheered you</p>
          <p className="text-[10px] text-gray-400 leading-tight truncate">“keep it going 👏”</p>
        </div>
      </FloatCard>
    </div>
  )
}

function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className="w-8 h-8 rounded-xl bg-brand-600 grid place-items-center shrink-0">
        <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] text-white" fill="currentColor" aria-hidden><path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z"/></svg>
      </span>
      <span className="font-bold text-[17px] text-gray-900 tracking-tight">BeActive</span>
    </div>
  )
}

export default function LandingPage() {
  return (
    <main className="bg-white overflow-x-hidden lg:grid lg:grid-cols-2 lg:h-screen lg:overflow-hidden">
      {/* ── LEFT · sell the feeling ─────────────────────────────── */}
      <section className="relative flex flex-col px-5 sm:px-12 lg:px-14 lg:h-screen overflow-hidden" style={{ background: SAGE_STAGE }}>
        <header className="shrink-0 pt-6 lg:pt-8">
          <Logo />
        </header>

        <div className="flex-1 min-h-0 flex flex-col justify-center gap-7 lg:gap-9 py-7">
          <div className="max-w-lg animate-fade-in">
            <h1 className="text-[2.4rem] sm:text-5xl xl:text-6xl font-bold tracking-tight text-gray-900 leading-[0.98]">
              Small steps.<br />
              Every day.<br />
              <span className="text-brand-600">Momentum that lasts.</span>
            </h1>
            <p className="mt-4 text-[15px] sm:text-base text-gray-500 leading-relaxed max-w-md">
              BeActive turns one daily activity into a streak you’ll want to protect — with friends who keep you moving.
            </p>
          </div>

          <Composition />
        </div>
      </section>

      {/* ── RIGHT · convert ─────────────────────────────────────── */}
      <section className="flex flex-col items-center justify-center px-5 sm:px-12 py-12 lg:py-0 lg:h-screen">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center text-center">
            <span className="w-13 h-13 min-w-[52px] min-h-[52px] rounded-2xl bg-brand-50 grid place-items-center mb-4">
              <svg viewBox="0 0 24 24" className="w-6 h-6 text-brand-600" fill="currentColor" aria-hidden><path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z"/></svg>
            </span>
            <h2 className="text-[24px] font-bold text-gray-900 tracking-tight">Build the habit.</h2>
            <p className="mt-2 text-[14px] text-gray-500 leading-relaxed">One photo a day. A growing streak. Friends who notice.</p>
          </div>

          <div className="mt-7 space-y-3">
            <Link href="/signup" className="flex items-center justify-center w-full min-h-[52px] rounded-2xl bg-brand-600 text-white font-semibold text-[15px] shadow-[0_8px_24px_-8px_rgba(21,128,61,0.5)] hover:bg-brand-700 active:scale-[0.99] transition-all">
              Start your streak
            </Link>
            <Link href="/login" className="flex items-center justify-center w-full min-h-[52px] rounded-2xl border border-gray-200 text-gray-800 font-semibold text-[15px] hover:border-brand-300 hover:bg-brand-50/40 active:scale-[0.99] transition-all">
              I already have an account
            </Link>
          </div>

          <p className="mt-6 text-center text-[12px] text-gray-400 leading-relaxed">
            Free to start. By continuing you agree to our{' '}
            <Link href="/terms" className="text-brand-600 hover:underline">Terms</Link> and{' '}
            <Link href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link>.
          </p>
        </div>
      </section>
    </main>
  )
}
