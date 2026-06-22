import Link from 'next/link'

/* BeActive landing — "Quiet Momentum"
   Split-screen: left sells the feeling (our real identity — streak ring, growing
   plant, weekly consistency, a friend's cheer), right converts with one calm CTA.
   White + sage/forest, no stock photos, no neon. Email auth only (no fake OAuth). */

const SAGE_STAGE = '#f4f7f3'

/* ── the living composition (left) ─────────────────────────── */
function StreakRing() {
  const SIZE = 132, R = 56, STROKE = 8
  const CIRC = 2 * Math.PI * R
  const pct = 0.62 // 42 → next milestone 100, ~62%
  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} className="-rotate-90">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#e3ece1" strokeWidth={STROKE} />
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
          stroke="url(#ring)" strokeWidth={STROKE} strokeLinecap="round"
          strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct)}
        />
        <defs>
          <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4ade80" />
            <stop offset="1" stopColor="#15803d" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl leading-none animate-breathe">🌿</span>
        <span className="text-4xl font-bold text-gray-900 leading-none mt-1 tracking-tight tabular-nums">42</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mt-0.5">day streak</span>
      </div>
    </div>
  )
}

function FloatCard({ className = '', style, children }: { className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div className={`absolute rounded-2xl bg-white/90 backdrop-blur-sm border border-black/[0.04] shadow-[0_12px_40px_-12px_rgba(20,80,40,0.18)] ${className}`} style={style}>
      {children}
    </div>
  )
}

function Composition() {
  return (
    <div className="relative w-full max-w-[460px] aspect-square mx-auto">
      {/* organic sage glows — nature, not dashboard */}
      <div className="absolute -top-8 left-4 w-72 h-72 rounded-full bg-brand-200/40 blur-3xl" aria-hidden />
      <div className="absolute bottom-0 right-2 w-64 h-64 rounded-full bg-brand-300/30 blur-3xl" aria-hidden />
      {/* soft leaf accents */}
      <svg className="absolute -bottom-2 -left-3 w-28 h-28 text-brand-400/40 -rotate-12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z"/></svg>
      <svg className="absolute top-2 right-0 w-16 h-16 text-brand-300/50 rotate-[18deg]" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z"/></svg>

      {/* center — today's card */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[230px] rounded-3xl bg-white border border-black/[0.05] shadow-[0_24px_70px_-20px_rgba(20,80,40,0.25)] p-6 flex flex-col items-center">
        <StreakRing />
        <div className="mt-4 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500" aria-hidden />
          <span className="text-[13px] font-semibold text-brand-700">Locked in today</span>
        </div>
        {/* 7-day consistency */}
        <div className="mt-3 flex gap-1.5" aria-hidden>
          {[1, 1, 1, 1, 1, 1, 0].map((on, i) => (
            <span key={i} className={`w-5 h-1.5 rounded-full ${on ? 'bg-brand-400' : 'bg-gray-200'}`} />
          ))}
        </div>
      </div>

      {/* float: weekly progress */}
      <FloatCard className="w-[150px] p-3.5 animate-breathe" style={{ top: '4%', right: '-2%', animationDelay: '0.4s' }}>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">This week</p>
        <p className="text-[22px] font-bold text-gray-900 leading-tight">6 of 7</p>
        <div className="mt-1.5 flex items-end gap-1 h-7" aria-hidden>
          {[5, 7, 4, 6, 7, 7, 2].map((h, i) => (
            <span key={i} className="flex-1 rounded-sm bg-gradient-to-t from-brand-200 to-brand-400" style={{ height: `${h * 12}%` }} />
          ))}
        </div>
      </FloatCard>

      {/* float: friend cheer — positive peer pressure */}
      <FloatCard className="w-[176px] p-3 flex items-center gap-2.5 animate-breathe" style={{ bottom: '6%', left: '-4%', animationDelay: '0.9s' }}>
        <span className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 grid place-items-center text-white text-sm font-bold shrink-0">M</span>
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-gray-900 leading-tight">Maya cheered you</p>
          <p className="text-[11px] text-gray-400 leading-tight">“keep it going 👏”</p>
        </div>
      </FloatCard>

      {/* float: plant tier */}
      <FloatCard className="px-3 py-2 flex items-center gap-2 animate-breathe" style={{ bottom: '30%', right: '-6%', animationDelay: '1.4s' }}>
        <span className="text-lg">🪴</span>
        <div>
          <p className="text-[11px] font-bold text-gray-900 leading-none">Sapling</p>
          <p className="text-[9.5px] text-gray-400 leading-none mt-0.5">8 days to Tree</p>
        </div>
      </FloatCard>
    </div>
  )
}

/* ── brand mark ─────────────────────────────────────────────── */
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
    <main className="min-h-[100svh] bg-white lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      {/* ── LEFT · sell the feeling ─────────────────────────────── */}
      <section
        className="relative flex flex-col px-7 sm:px-12 lg:px-16 pt-7 pb-12 lg:py-0 lg:justify-center overflow-hidden"
        style={{ background: SAGE_STAGE }}
      >
        <Logo className="lg:absolute lg:top-9 lg:left-16" />

        <div className="mt-10 lg:mt-0 max-w-lg animate-fade-in">
          <h1 className="text-[40px] sm:text-6xl font-bold tracking-tight text-gray-900 leading-[0.98]">
            Small steps.<br />
            Every day.<br />
            <span className="text-brand-600">Momentum that lasts.</span>
          </h1>
          <p className="mt-5 text-[16px] sm:text-lg text-gray-500 leading-relaxed max-w-md">
            BeActive turns one daily activity into a streak you’ll want to protect — with friends who keep you moving.
          </p>
        </div>

        <div className="mt-10 lg:mt-14">
          <Composition />
        </div>
      </section>

      {/* ── RIGHT · convert ─────────────────────────────────────── */}
      <section className="flex flex-col items-center justify-center px-7 sm:px-12 py-12 lg:py-0">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center text-center">
            <span className="w-14 h-14 rounded-2xl bg-brand-50 grid place-items-center mb-5">
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-brand-600" fill="currentColor" aria-hidden><path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z"/></svg>
            </span>
            <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Build the habit.</h2>
            <p className="mt-2 text-[15px] text-gray-500 leading-relaxed">
              One photo a day. A growing streak. Friends who notice.
            </p>
          </div>

          <div className="mt-8 space-y-3">
            <Link
              href="/signup"
              className="flex items-center justify-center w-full min-h-[52px] rounded-2xl bg-brand-600 text-white font-semibold text-[15px] shadow-[0_8px_24px_-8px_rgba(21,128,61,0.5)] hover:bg-brand-700 active:scale-[0.99] transition-all"
            >
              Start your streak
            </Link>
            <Link
              href="/login"
              className="flex items-center justify-center w-full min-h-[52px] rounded-2xl border border-gray-200 text-gray-800 font-semibold text-[15px] hover:border-brand-300 hover:bg-brand-50/40 active:scale-[0.99] transition-all"
            >
              I already have an account
            </Link>
          </div>

          <p className="mt-7 text-center text-[12px] text-gray-400 leading-relaxed">
            Free to start. By continuing you agree to our{' '}
            <Link href="/terms" className="text-brand-600 hover:underline">Terms</Link> and{' '}
            <Link href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link>.
          </p>
        </div>
      </section>
    </main>
  )
}
