function LogoIcon() {
  return (
    <div
      className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-500 mx-auto"
      style={{ boxShadow: '0 0 32px rgba(34,197,94,0.45), 0 4px 12px rgba(34,197,94,0.2)' }}
    >
      <svg viewBox="0 0 24 24" className="w-8 h-8 text-white" fill="currentColor" aria-hidden>
        <path d="M5 3l14 9-14 9V3z" />
      </svg>
    </div>
  )
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen relative overflow-hidden bg-[#060d06] flex items-center justify-center px-4 py-12">
      {/* Ambient orbs */}
      <div
        className="absolute -top-48 -left-48 w-[600px] h-[600px] rounded-full blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(34,197,94,0.08), transparent 70%)' }}
        aria-hidden
      />
      <div
        className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(74,222,128,0.05), transparent 70%)' }}
        aria-hidden
      />

      <div className="w-full max-w-md relative z-10">
        {/* Brand header */}
        <div className="text-center mb-8">
          <LogoIcon />
          <h1 className="mt-4 text-2xl font-bold text-white">BeActive</h1>
          <p className="mt-1.5 text-sm text-white/40">
            Daily workout proof. Social accountability.
          </p>
        </div>

        {/* Form card — white floating on dark */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3)' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
