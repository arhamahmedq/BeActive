export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <span className="font-bold text-lg">BeActive</span>
        </div>
      </nav>
      <main className="max-w-2xl mx-auto py-6 px-4">{children}</main>
    </div>
  )
}
