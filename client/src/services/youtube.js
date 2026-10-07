import api from './api'

/**
 * Client wrapper for the server's YouTube discovery endpoints.
 *
 * The Google API key never comes into the browser: every call below goes to
 * our own Express backend, which holds the key in server/.env and proxies the
 * metadata. This also means the daily quota is enforced server-side.
 *
 * Nothing here returns or resolves a media stream. Playback is performed by
 * YouTube's official embedded player (see YouTubeFrame.jsx).
 */
export const youtubeService = {
  /** Is the integration enabled on the server? */
  status: () => api.get('/youtube/status').then((r) => r.data.data),

  /** Music-only video search. Cached server-side to protect quota. */
  search: ({ q, page = 1, maxResults = 20, order }) =>
    api.get('/youtube/search', { params: { q, page, maxResults, order } }).then((r) => r.data.data),

  /** Metadata for specific ids. */
  videos: (ids) => api.get('/youtube/videos', { params: { ids: ids.join(',') } }).then((r) => r.data.data),

  /** Metadata for one video. */
  video: (videoId) => api.get(`/youtube/videos/${videoId}`).then((r) => r.data.data),

  /** Popular music videos. */
  trending: (maxResults = 20) =>
    api.get('/youtube/trending', { params: { maxResults } }).then((r) => r.data.data),

  /**
   * Save a YouTube video into the MUSICA library so it shows up next to
   * first-party uploads. Requires authentication.
   */
  saveSong: (videoId) => api.post('/youtube/songs', { videoId }).then((r) => r.data.data),
}

/**
 * Maps an API video to the same shape MUSICA uses for songs, so the existing
 * SongCard / SongRow components can render YouTube results unchanged.
 *
 * Note there is no audioUrl: YouTube audio is never hosted by MUSICA.
 */
export function youtubeToSong(video, extra = {}) {
  return {
    _id: `yt:${video.videoId}`,
    source: 'youtube',
    youtubeVideoId: video.videoId,
    youtubeChannelId: video.channelId,
    youtubeChannelTitle: video.channelTitle,
    embedUrl: video.embedUrl,
    title: video.title,
    artistName: video.channelTitle || 'Unknown channel',
    coverUrl: video.thumbnail || '',
    duration: video.durationSeconds || 0,
    viewCount: video.viewCount || 0,
    publishedAt: video.publishedAt,
    embeddable: video.embeddable !== false,
    // Deliberately empty: we do not host YouTube audio.
    audioUrl: '',
    ...extra,
  }
}

export default youtubeService