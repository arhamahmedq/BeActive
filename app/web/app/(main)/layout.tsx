import { MainNav } from '@/components/layouts/MainNav'
import { MobileNav } from '@/components/layouts/MobileNav'
import { DesktopSideNav } from '@/components/layouts/DesktopSideNav'
import { NotificationToast } from '@/components/features/NotificationToast'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-app">
      <MainNav />

      {/* Side nav appears fixed on lg+; add pl-16 to leave room for collapsed rail */}
      <DesktopSideNav />

      {/*
        Mobile: pb-24 reserves space for the bottom tab bar.
        Desktop (lg+): pl-16 reserves space for the collapsed 64px side rail.
        Content stays max-w-2xl centered within the remaining area.
      */}
      <main className="py-6 px-4 pb-24 md:pb-6 lg:pl-20 lg:pb-8">
        <div className="max-w-2xl mx-auto">{children}</div>
      </main>

      <MobileNav />
      <NotificationToast />
    </div>
  )
}
