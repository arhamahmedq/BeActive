function LogoMark() {
  return (
    <svg
      viewBox="0 0 48 48"
      className="w-14 h-14 mx-auto"
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer circle */}
      <circle cx="24" cy="24" r="23" fill="white" stroke="#e5e7eb" strokeWidth="1" />
      {/* Play-flag shape — two triangles forming the BeActive mark */}
      {/* Green shadow offset shape */}
      <polygon points="14,32 14,17 30,24" fill="#22c55e" opacity="0.25" transform="translate(2,2)" />
      {/* Dark main shape */}
      <polygon points="14,32 14,17 30,24" fill="#111827" />
      {/* Second shape (right flag) */}
      <polygon points="20,32 20,17 36,24" fill="#111827" opacity="0.7" />
    </svg>
  )
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <LogoMark />
          <h1 className="mt-4 text-[28px] font-bold tracking-tight text-gray-900">BeActive</h1>
          <p className="mt-1.5 text-sm text-gray-500">
            Daily workout proof. Social accountability.
          </p>
        </div>
        {children}
      </div>
    </div>
  )
}
