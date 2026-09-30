import api from './api'

/** Typed-ish wrappers around the song endpoints. */
export const songsService = {
  discover: () => api.get('/songs/discover').then((r) => r.data.data),

  list: ({ page = 1, limit = 20, sort = 'newest', genre, uploadedBy } = {}) =>
    api.get('/songs', { params: { page, limit, sort, genre, uploadedBy } }).then((r) => r.data.data),

  get: (id) => api.get(`/songs/${id}`).then((r) => r.data.data),

  mine: () => api.get('/songs/mine').then((r) => r.data.data),

  liked: () => api.get('/songs/liked').then((r) => r.data.data),

  /**
   * Uploads with real progress so the UI can show a percentage.
   * onProgress receives 0-100.
   */
  upload: (formData, onProgress) => {
    const form = formData
    return api.post('/songs', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress(event) {
        if (!onProgress || !event.total) return
        onProgress(Math.round((event.loaded / event.total) * 100))
      },
    }).then((r) => r.data.data)
  },

  update: (id, formData, onProgress) =>
    api.put(`/songs/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress(event) {
        if (!onProgress || !event.total) return
        onProgress(Math.round((event.loaded / event.total) * 100))
      },
    }).then((r) => r.data.data),

  remove: (id) => api.delete(`/songs/${id}`).then((r) => r.data.data),

  like: (id) => api.post(`/songs/${id}/like`).then((r) => r.data.data),

  unlike: (id) => api.delete(`/songs/${id}/like`).then((r) => r.data.data),

  /** Fire-and-forget; failures must never interrupt playback. */
  recordPlay: (id) => api.post(`/songs/${id}/play`).catch(() => null),
}

export default songsService
