import { MainNav } from '@/components/layouts/MainNav'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <MainNav />
      <main className="max-w-2xl mx-auto py-6 px-4">{children}</main>
    </div>
  )
}
