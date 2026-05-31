import Link from 'next/link'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/feed" className="font-bold text-lg hover:opacity-70 transition-opacity">
            BeActive
          </Link>
          <Link
            href="/upload"
            className="inline-flex items-center gap-1.5 bg-black text-white text-sm font-medium px-4 py-2 rounded-full hover:bg-gray-800 transition-colors"
          >
            <span aria-hidden>+</span>
            Log workout
          </Link>
        </div>
      </nav>
      <main className="max-w-2xl mx-auto py-6 px-4">{children}</main>
    </div>
  )
}
