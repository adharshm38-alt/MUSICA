/** Single source of truth for navigation items (sidebar + mobile bar). */
export const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/explore', label: 'Explore', icon: 'compass' },
  { to: '/library', label: 'Library', icon: 'library' },
  { to: '/search', label: 'Search', icon: 'search' },
  { to: '/playlists', label: 'Playlists', icon: 'playlist' },
  // requiresUploads: hidden when the server reports uploads are disabled, which
  // is the case on a host with no persistent disk for uploaded audio.
  { to: '/upload', label: 'Upload', icon: 'upload', requiresAuth: true, requiresUploads: true },
  { to: '/following', label: 'Following', icon: 'users', requiresAuth: true },
  { to: '/profile', label: 'Profile', icon: 'user', requiresAuth: true },
  { to: '/settings', label: 'Settings', icon: 'settings', requiresAuth: true },
]

/**
 * The four destinations that get a permanent slot in the mobile bottom bar.
 * Everything else moves behind the profile button, so the bar stays comfortable
 * one-handed: four targets plus overflow instead of six cramped ones.
 */
export const MOBILE_NAV = ['/', '/explore', '/library', '/search']
