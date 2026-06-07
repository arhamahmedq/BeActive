import Link from 'next/link'

function LogoMark() {
  return (
    <svg viewBox="0 0 48 48" className="w-16 h-16" aria-hidden fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="23" fill="white" stroke="#e5e7eb" strokeWidth="1" />
      <polygon points="14,32 14,17 30,24" fill="#22c55e" opacity="0.25" transform="translate(2,2)" />
      <polygon points="14,32 14,17 30,24" fill="#111827" />
      <polygon points="20,32 20,17 36,24" fill="#111827" opacity="0.7" />
    </svg>
  )
}

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-app flex flex-col">
      {/* Top nav */}
      <nav className="sticky top-0 z-40 px-6 py-4 flex items-center justify-between max-w-5xl mx-auto w-full"
           style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.5)' }}>
        <span className="font-bold text-lg text-gray-900">BeActive</span>
        <Link
          href="/login"
          className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          Sign in
        </Link>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 pt-16 pb-24">
        <LogoMark />

        <h1 className="mt-8 text-[42px] sm:text-[52px] font-bold tracking-tight text-gray-900 max-w-lg leading-[1.05]">
          Your friends are<br />working out.
        </h1>

        <p className="mt-5 text-lg text-gray-500 max-w-sm leading-relaxed">
          Post daily proof. Build streaks. Hold each other accountable.
          One photo a day keeps the excuses away.
        </p>

        {/* Feature pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-7">
          {[
            { icon: '📸', label: 'Daily proof' },
            { icon: '🔥', label: 'Streak tracking' },
            { icon: '👥', label: 'Social accountability' },
          ].map(({ icon, label }) => (
            <span
              key={label}
              className="px-4 py-2 rounded-full text-sm font-medium text-gray-700 border border-gray-200"
              style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(8px)' }}
            >
              {icon} {label}
            </span>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 mt-10 w-full max-w-xs sm:max-w-none sm:justify-center">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center px-8 py-3.5 rounded-full bg-brand-500 text-white font-semibold text-[15px] hover:bg-brand-600 active:scale-[0.98] transition-all"
            style={{ boxShadow: '0 4px 16px rgba(34,197,94,0.4)' }}
          >
            Get started — it&apos;s free
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-8 py-3.5 rounded-full bg-white border border-gray-200 text-gray-700 font-semibold text-[15px] hover:bg-gray-50 active:scale-[0.98] transition-all shadow-sm"
          >
            Sign in
          </Link>
        </div>

        <p className="mt-8 text-xs text-gray-400">No algorithm. No follower count. Just your streak and your friends.</p>
      </section>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-gray-400">
        © {new Date().getFullYear()} BeActive
      </footer>
    </main>
  )
}
