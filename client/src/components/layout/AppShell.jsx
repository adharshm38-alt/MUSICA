import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import MobileTopBar from './MobileTopBar'
import MobileBottomNav from './MobileBottomNav'
import MusicPlayer from '../player/MusicPlayer'
import FullPlayer from '../player/FullPlayer'
import YouTubeStage from '../player/YouTubeStage'

/**
 * App chrome: sidebar on desktop, top+bottom bars on mobile, and the
 * persistent player rendered once for the whole app.
 */
export default function AppShell() {
  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Page content */}
      <div className="lg:pl-[260px]">
        <MobileTopBar />

        <main className="px-4 pb-player sm:px-6 lg:px-10" id="main-content">
          {/* Remount on route change to replay the page transition */}
          <div key={location.pathname} className="animate-fade-up pt-2 lg:pt-4">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Player (desktop bar + mobile compact) */}
      <MusicPlayer />

      {/* Mobile bottom nav */}
      <MobileBottomNav />

      {/* Full-screen player (mobile) */}
      <FullPlayer />

      {/* YouTube stage: the visible, official embedded player. Mounted globally
          because a YouTube track can be started from any page, and the player
          must stay visible for as long as the video is playing. Renders nothing
          at all for first-party uploads. */}
      <YouTubeStage />
    </div>
  )
}
