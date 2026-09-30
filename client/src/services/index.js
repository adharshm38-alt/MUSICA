import api from './api'

// songs.js holds songsService; re-export it so every page can import
// all services from one place.
export { songsService } from './songs'

/** Playlists, users, search, history and reports. */

export const playlistsService = {
  list: ({ scope = 'public', page = 1, limit = 24 } = {}) =>
    api.get('/playlists', { params: { scope, page, limit } }).then((r) => r.data.data),

  get: (id) => api.get(`/playlists/${id}`).then((r) => r.data.data),

  create: (payload) => api.post('/playlists', payload).then((r) => r.data.data),

  update: (id, payload) => api.put(`/playlists/${id}`, payload).then((r) => r.data.data),

  remove: (id) => api.delete(`/playlists/${id}`).then((r) => r.data.data),

  addSongs: (id, songIds) =>
    api.post(`/playlists/${id}/songs`, { songIds }).then((r) => r.data.data),

  removeSong: (id, songId) =>
    api.delete(`/playlists/${id}/songs/${songId}`).then((r) => r.data.data),

  reorder: (id, songIds) =>
    api.put(`/playlists/${id}/songs/order`, { songIds }).then((r) => r.data.data),
}

export const usersService = {
  get: (id) => api.get(`/users/${id}`).then((r) => r.data.data),

  update: (id, payload) => api.put(`/users/${id}`, payload).then((r) => r.data.data),

  follow: (id) => api.post(`/users/${id}/follow`).then((r) => r.data.data),

  unfollow: (id) => api.delete(`/users/${id}/follow`).then((r) => r.data.data),

  connections: (id, type = 'following', page = 1) =>
    api.get(`/users/${id}/connections`, { params: { type, page } }).then((r) => r.data.data),
}

export const searchService = {
  search: (q, type = 'all') =>
    api.get('/search', { params: { q, type } }).then((r) => r.data.data),

  suggest: (q) => api.get('/search/suggest', { params: { q } }).then((r) => r.data.data),
}

export const historyService = {
  list: (limit = 30) => api.get('/history', { params: { limit } }).then((r) => r.data.data),

  clear: () => api.delete('/history').then((r) => r.data.data),

  remove: (songId) => api.delete(`/history/${songId}`).then((r) => r.data.data),
}

export const reportsService = {
  create: (payload) => api.post('/reports', payload).then((r) => r.data.data),

  mine: () => api.get('/reports/mine').then((r) => r.data.data),
}

export const adminService = {
  stats: () => api.get('/admin/stats').then((r) => r.data.data),

  users: (params = {}) => api.get('/admin/users', { params }).then((r) => r.data.data),

  setRole: (id, role) => api.put(`/admin/users/${id}/role`, { role }).then((r) => r.data.data),

  setStatus: (id, isActive) =>
    api.put(`/admin/users/${id}/status`, { isActive }).then((r) => r.data.data),

  songs: (params = {}) => api.get('/admin/songs', { params }).then((r) => r.data.data),

  removeSong: (id) => api.delete(`/admin/songs/${id}`).then((r) => r.data.data),

  reports: (params = {}) => api.get('/admin/reports', { params }).then((r) => r.data.data),

  updateReport: (id, payload) => api.put(`/admin/reports/${id}`, payload).then((r) => r.data.data),
}
