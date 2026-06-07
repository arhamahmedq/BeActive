import { MainNav } from '@/components/layouts/MainNav'
import { NotificationToast } from '@/components/features/NotificationToast'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-app">
      <MainNav />
      <main className="max-w-2xl mx-auto py-6 px-4">{children}</main>
      <NotificationToast />
    </div>
  )
}
