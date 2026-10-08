import { Outlet, useLocation } from 'react-router-dom'
import { usePlayer } from '../../context/PlayerContext'
import { cx } from '../../utils/format'
import Sidebar from './Sidebar'
import MobileTopBar from './MobileTopBar'
import MobileBottomNav from './MobileBottomNav'
import MusicPlayer from '../player/MusicPlayer'
import FullPlayer from '../player/FullPlayer'
import YouTubeStage from '../player/YouTubeStage'
import QueuePanel from '../player/QueuePanel'

/**
 * App chrome.
 *
 * Layout contract, in layers from the bottom up:
 *   - bottom navigation (mobile only)
 *   - the persistent mini-player dock, sitting directly above it
 *   - page content, padded so neither of the above can cover the last row
 *   - desktop sidebar (lg and up)
 *
 * The fullscreen player and the YouTube stage render above all of it and are
 * the only things allowed to cover the page.
 *
 * QueuePanel is mounted HERE, exactly once for the whole app, because it reads
 * the player's shared `isQueueOpen` flag. Both the mini-player and the desktop
 * bar open that same panel, so two instances can never exist.
 */
export default function AppShell() {
  const { isYouTube, fullPlayerOpen } = usePlayer()
  const location = useLocation()

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <Sidebar />

      <div className="lg:pl-[260px]">
        <MobileTopBar />

        <main
          className={cx(
            'px-4 sm:px-6 lg:px-10',
            // While a YouTube track is loaded the official player is docked
            // above the mini-player, so the page needs extra room to stay
            // visible and scrollable underneath it.
            isYouTube ? 'pb-youtube-dock' : 'pb-player',
          )}
          id="main-content"
        >
          {/* Remount on route change to replay the page transition */}
          <div key={location.pathname} className="animate-fade-up pt-2 lg:pt-4">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Player (desktop bar + mobile dock) */}
      <MusicPlayer />

      {/* Mobile bottom navigation. Hidden only when the fullscreen player is
          intentionally covering the screen. */}
      {!fullPlayerOpen ? <MobileBottomNav /> : null}

      {/* Full-screen player (mobile) */}
      <FullPlayer />

      {/* Queue panel, shared by every entry point. */}
      <QueuePanel />

      {/* YouTube stage: the visible, official embedded player. Mounted globally
          because a YouTube track can be started from any page, and the player
          must stay visible for as long as the video is playing. Renders nothing
          at all for first-party uploads. */}
      <YouTubeStage />
    </div>
  )
}