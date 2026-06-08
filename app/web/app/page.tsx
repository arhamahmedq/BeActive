import Link from 'next/link'

function HeroStreakPreview() {
  // 62% progress toward 100-day milestone (42 current)
  const SIZE = 72
  const R = 26
  const STROKE = 4.5
  const CIRC = 2 * Math.PI * R
  const offset = CIRC * (1 - 0.62)

  return (
    <div
      className="bg-white/6 border border-white/10 rounded-2xl p-4 backdrop-blur-md"
      aria-hidden
    >
      <div className="flex items-center gap-3">
        {/* Mini ring */}
        <div className="relative flex-shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} className="-rotate-90">
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="rgba(34,197,94,0.12)" strokeWidth={STROKE} />
            <circle
              cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
              stroke="#22c55e" strokeWidth={STROKE}
              strokeDasharray={`${CIRC} ${CIRC}`}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-base leading-none">🌿</span>
            <span className="text-white font-bold text-lg leading-none mt-0.5">42</span>
            <span className="text-white/40 text-[8px] leading-none mt-0.5">days</span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm">42-day streak</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 flex-shrink-0" />
            <p className="text-brand-400 text-xs">Locked in today</p>
          </div>
          <p className="text-white/30 text-xs mt-1">Best: 67 · Next milestone: 100</p>
        </div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      {/* ── DARK HERO ─────────────────────────────────────────────────────── */}
      <section className="relative min-h-[100svh] bg-[#060d06] overflow-hidden flex flex-col">
        {/* Ambient glow orbs */}
        <div className="absolute -top-48 -left-48 w-[700px] h-[700px] rounded-full bg-brand-500/7 blur-3xl pointer-events-none" aria-hidden />
        <div className="absolute top-1/2 -right-24 w-[500px] h-[500px] rounded-full bg-brand-400/5 blur-3xl pointer-events-none" aria-hidden />
        <div className="absolute -bottom-24 left-1/3 w-[400px] h-[400px] rounded-full bg-brand-600/5 blur-3xl pointer-events-none" aria-hidden />

        {/* Nav */}
        <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-5xl mx-auto w-full">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="currentColor" aria-hidden>
                <path d="M5 3l14 9-14 9V3z" />
              </svg>
            </div>
            <span className="text-white font-bold text-lg">BeActive</span>
          </div>
          <Link
            href="/login"
            className="text-sm font-medium text-white/50 hover:text-white transition-colors"
          >
            Sign in
          </Link>
        </nav>

        {/* Hero content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 pb-16 pt-4">
          {/* Eyebrow pill */}
          <div className="inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 rounded-full px-4 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400" aria-hidden />
            <span className="text-brand-300 text-xs font-medium tracking-wide">
              Streak-powered workout accountability
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-7xl font-bold text-white tracking-tight leading-[0.92] mb-6 max-w-xl">
            Don&apos;t break<br />
            <span className="text-brand-400">the chain.</span>
          </h1>

          <p className="text-white/45 text-lg max-w-md mb-10 leading-relaxed">
            Post one workout photo per day. Build streaks with friends.
            Miss a day — start over. No excuses.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs sm:max-w-none sm:justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center px-8 py-3.5 rounded-full bg-brand-500 text-white font-semibold text-[15px] hover:bg-brand-400 active:scale-[0.98] transition-all"
              style={{ boxShadow: '0 0 32px rgba(34,197,94,0.4), 0 4px 14px rgba(34,197,94,0.2)' }}
            >
              Start your streak — it&apos;s free
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center px-8 py-3.5 rounded-full border border-white/12 text-white font-semibold text-[15px] hover:bg-white/8 active:scale-[0.98] transition-all"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              I have an account
            </Link>
          </div>

          {/* Product preview */}
          <div className="mt-16 w-full max-w-xs">
            <HeroStreakPreview />
            <p className="text-white/20 text-xs mt-3">Your streak lives here every day</p>
          </div>
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────────────────── */}
      <section className="bg-white py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-eyebrow mb-3">how it works</p>
          <h2 className="text-center text-3xl font-bold text-gray-900 mb-12 tracking-tight">
            One photo. One chain. No breaks.
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              {
                icon: '📸',
                tag: 'AI-verified',
                title: 'Proof of work',
                desc: 'Post one photo of your workout each day. AI verifies it\'s real fitness activity — no shortcuts.',
              },
              {
                icon: '🔥',
                tag: 'No excuses',
                title: 'Streak tracking',
                desc: 'Miss one day and your streak resets to zero. The pressure is the whole point.',
              },
              {
                icon: '👥',
                tag: 'Friends keep you honest',
                title: 'Social accountability',
                desc: 'Your friends see exactly when you post — and exactly when you don\'t.',
              },
            ].map(({ icon, tag, title, desc }) => (
              <div
                key={title}
                className="p-6 rounded-2xl border border-gray-100 hover:border-brand-200 hover:shadow-[0_4px_24px_rgba(34,197,94,0.08)] transition-all duration-200"
              >
                <p className="text-3xl mb-4">{icon}</p>
                <span className="inline-block text-[11px] font-semibold text-brand-600 bg-brand-50 px-2.5 py-0.5 rounded-full mb-2">
                  {tag}
                </span>
                <h3 className="font-bold text-gray-900 text-base mb-1.5">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ────────────────────────────────────────────────────── */}
      <section className="bg-[#060d06] py-20 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
          <div className="w-[400px] h-[400px] rounded-full bg-brand-500/6 blur-3xl" />
        </div>
        <div className="relative z-10">
          <p className="text-white/30 text-xs font-medium tracking-widest uppercase mb-4">start today</p>
          <h2 className="text-4xl font-bold text-white mb-6 leading-tight tracking-tight">
            Your streak starts<br />at zero.
          </h2>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center px-10 py-4 rounded-full bg-brand-500 text-white font-semibold text-base hover:bg-brand-400 active:scale-[0.98] transition-all"
            style={{ boxShadow: '0 0 24px rgba(34,197,94,0.35)' }}
          >
            Get started — it&apos;s free
          </Link>
          <p className="text-white/25 text-xs mt-8">No algorithm. No follower count. Just your streak.</p>
        </div>
      </section>

      <footer className="bg-[#060d06] border-t border-white/5 py-6 text-center">
        <p className="text-white/20 text-xs">© {new Date().getFullYear()} BeActive</p>
      </footer>
    </main>
  )
}
