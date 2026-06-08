import { MainNav } from '@/components/layouts/MainNav'
import { MobileNav } from '@/components/layouts/MobileNav'
import { DesktopSideNav } from '@/components/layouts/DesktopSideNav'
import { DesktopRightSidebar } from '@/components/layouts/DesktopRightSidebar'
import { NotificationToast } from '@/components/features/NotificationToast'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-app">
      <MainNav />
      <DesktopSideNav />
      {/* Right sidebar: xl+ only, fixed right column (w-64) */}
      <DesktopRightSidebar />

      {/*
        Mobile/tablet (< lg):  pb-28 clears MobileNav + iPhone home bar
        Desktop (lg–xl):       pl-20 clears left rail, pb-8
        Wide desktop (xl+):    pl-20 + pr-72 clears both sidebars
      */}
      <main className="py-6 px-4 pb-28 lg:pl-20 lg:pb-8 xl:pr-72">
        <div className="max-w-[500px] mx-auto">{children}</div>
      </main>

      <MobileNav />
      <NotificationToast />
    </div>
  )
}
