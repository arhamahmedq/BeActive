/* Auth shell — matches the landing's natural/editorial language:
   light app background, leaf mark in a sage disc, serif "Be active" wordmark,
   and a soft white form card. Shared by /login, /signup, /onboarding,
   /verify-email so all four stay coherent with the marketing surface. */

const LEAF_BODY = 'M4.5 19.5C4.5 11 11 4.5 19.5 4.5c0 8.5-6.5 15-15 15z'
const LEAF_OUTLINE = 'M5.5 18.5C10 15 14.5 10.5 18 6'

function LeafMark() {
  return (
    <span className="mx-auto inline-grid h-20 w-20 place-items-center rounded-full bg-[#eef3e8]">
      <svg
        viewBox="0 0 24 24"
        className="h-10 w-10 text-[#4f7a3c]"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={LEAF_BODY} />
        <path d={LEAF_OUTLINE} />
      </svg>
    </span>
  )
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-app min-h-dvh flex items-center justify-center px-4 py-12 text-[#1d2b22]">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="mb-8 text-center">
          <LeafMark />
          <h1 className="mt-4 font-serif text-[32px] font-normal tracking-tight text-[#1d2b22]">Be active</h1>
          <p className="mt-1.5 text-sm text-gray-500">Daily workout proof. Social accountability.</p>
        </div>

        {/* Form card — soft white on the light app background */}
        <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-[0_20px_50px_-20px_rgba(40,70,30,0.25),0_4px_16px_-8px_rgba(0,0,0,0.08)]">
          {children}
        </div>
      </div>
    </div>
  )
}
