/** Single source of truth for navigation items (sidebar + mobile bar). */
export const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/discover', label: 'Discover', icon: 'compass' },
  { to: '/search', label: 'Search', icon: 'search' },
  { to: '/library', label: 'Library', icon: 'heart' },
  { to: '/playlists', label: 'Playlists', icon: 'playlist' },
  { to: '/upload', label: 'Upload', icon: 'upload', requiresAuth: true },
  { to: '/following', label: 'Following', icon: 'users', requiresAuth: true },
  { to: '/profile', label: 'Profile', icon: 'user', requiresAuth: true },
  { to: '/settings', label: 'Settings', icon: 'settings', requiresAuth: true },
]

/** Items shown in the mobile bottom bar (keeps it to 5 for thumb reach). */
export const MOBILE_NAV = ['/', '/discover', '/search', '/library', '/playlists']
