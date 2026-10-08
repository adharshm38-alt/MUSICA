/**
 * Normalized music data model.
 *
 * Every source (local library, YouTube, anything added later) is translated
 * into these shapes so the rest of MUSICA - Home, Search, the player - never
 * needs to know where a track came from.
 *
 * These are plain objects, not Mongoose documents. Nothing here is persisted:
 * external catalogues are resolved at query time and discarded, so we never
 * mirror a large external library into our own database.
 *
 * IMPORTANT - what `playable` means
 * ---------------------------------
 * `playable` indicates that an AUTHORIZED playback route exists for the track.
 * For the YouTube source that is always YouTube's own official embedded player.
 * It is NOT a statement that we hold or can produce an audio file. No source in
 * this architecture may extract, download, rip, cache or separate audio from a
 * third-party service; resolution returns a reference to an official player and
 * nothing more.
 */

/** Canonical source ids. Adding a source means adding one of these. */
export const SOURCE_LOCAL = 'local'
export const SOURCE_YOUTUBE = 'youtube'

/** Playback routes a source can offer. */
export const PLAYBACK_LOCAL_AUDIO = 'local-audio'
export const PLAYBACK_YOUTUBE_EMBED = 'youtube-embed'

/**
 * Normalizes a first-party / user-owned Song document into a Track.
 *
 * @param {object} song a Song document or lean object
 * @param {{liked?: boolean}} [opts]
 * @returns {object} Track
 */
export function trackFromLocal(song, opts = {}) {
  if (!song) return null

  const source = song.source === SOURCE_YOUTUBE ? SOURCE_YOUTUBE : SOURCE_LOCAL

  return {
    // Stable, collision-free id: local songs use their ObjectId.
    id: String(song._id),
    kind: 'track',
    sourceId: source,
    sourceTrackId: source === SOURCE_YOUTUBE ? song.youtubeVideoId : String(song._id),

    title: song.title || 'Untitled',
    artist: song.artistName || 'Unknown artist',
    artistId: song.uploadedBy ? String(song.uploadedBy) : null,
    album: song.album || '',
    albumId: null,
    artwork: song.coverUrl || '',
    duration: Number(song.duration) || 0,

    // Playback resolution. A YouTube-sourced Song has no audio of ours.
    playable: source === SOURCE_LOCAL ? Boolean(song.audioUrl) : Boolean(song.youtubeVideoId),
    playback: source === SOURCE_YOUTUBE ? PLAYBACK_YOUTUBE_EMBED : PLAYBACK_LOCAL_AUDIO,
    playbackUrl: source === SOURCE_LOCAL ? song.audioUrl || '' : '',
    youtubeVideoId: song.youtubeVideoId || '',

    explicit: false,
    language: song.language || '',
    region: song.region || '',
    releaseDate: song.releaseYear ? `${song.releaseYear}-01-01` : null,
    genre: song.genre || '',

    playCount: song.playCount ?? 0,
    likeCount: song.likeCount ?? 0,
    liked: Boolean(opts.liked),

    // Kept so the existing player and card components keep working unchanged.
    //
    // audioUrl in particular is REQUIRED: PlayerContext reads
    // `currentSong.audioUrl` when it attaches media to the shared HTMLAudioElement.
    // Omitting it made local tracks resolve to an empty source and silently fail
    // to play, while YouTube tracks worked only because they are routed by
    // source rather than by audio URL.
    _id: String(song._id),
    source: source,
    audioUrl: song.audioUrl || '',
    audioKey: song.audioKey || '',
    artistName: song.artistName || 'Unknown artist',
    album: song.album || '',
    coverUrl: song.coverUrl || '',
  }
}

/**
 * Normalizes a YouTube video (as returned by youtube.service present()) into a
 * Track. Only public metadata is used; no media is requested or inspected.
 */
export function trackFromYouTube(video, opts = {}) {
  if (!video?.videoId) return null

  const playable = video.embeddable !== false

  return {
    id: `${SOURCE_YOUTUBE}:${video.videoId}`,
    kind: 'track',
    sourceId: SOURCE_YOUTUBE,
    sourceTrackId: video.videoId,

    title: video.title || 'Untitled',
    // YouTube's channel is the artist. This is the real, API-provided
    // attribution, not an inference.
    artist: video.channelTitle || 'Unknown channel',
    artistId: video.channelId || null,
    // The Data API exposes no album entity, so this is intentionally empty
    // rather than a fabricated grouping.
    album: '',
    albumId: null,
    artwork: video.thumbnail || '',
    artworkHigh: video.thumbnailHigh || '',
    duration: Number(video.durationSeconds) || 0,

    playable,
    // Resolution points at YouTube's official embed. We never obtain an audio
    // stream, and the client plays this inside the official iframe player.
    playback: PLAYBACK_YOUTUBE_EMBED,
    playbackUrl: '',
    youtubeVideoId: video.videoId,

    explicit: false,
    language: '',
    region: '',
    releaseDate: video.publishedAt || null,
    genre: 'Music',

    viewCount: video.viewCount || 0,
    embeddable: playable,
    embedUrl: video.embedUrl || null,
    watchUrl: video.watchUrl || null,

    // Compatibility with the existing player + card components.
    _id: `${SOURCE_YOUTUBE}:${video.videoId}`,
    source: SOURCE_YOUTUBE,
    youtubeChannelId: video.channelId || '',
    youtubeChannelTitle: video.channelTitle || '',
    artistName: video.channelTitle || 'Unknown channel',
    coverUrl: video.thumbnail || '',
  }
}

/**
 * Normalizes a YouTube channel into an Artist. Uses real channel metadata only.
 */
export function artistFromYouTube(channel, extra = {}) {
  if (!channel?.channelId) return null

  return {
    id: `${SOURCE_YOUTUBE}:${channel.channelId}`,
    kind: 'artist',
    sourceId: SOURCE_YOUTUBE,
    sourceArtistId: channel.channelId,

    name: channel.title || 'Unknown channel',
    artwork: channel.artwork || '',
    artworkHigh: channel.artworkHigh || '',
    description: channel.description || '',
    subscriberCount: channel.subscriberCount || 0,
    trackCount: extra.trackCount ?? channel.videoCount ?? 0,

    // Lets "Play" on an artist card start their top result.
    topTrackId: extra.topTrackId || null,
    topTrackTitle: extra.topTrackTitle || null,
    watchUrl: channel.watchUrl || null,

    // Compatibility with existing card components.
    _id: `${SOURCE_YOUTUBE}:${channel.channelId}`,
    displayName: channel.title || 'Unknown channel',
    avatarUrl: channel.artwork || '',
    followerCount: channel.subscriberCount || 0,
  }
}

/**
 * Normalizes a YouTube playlist into a Collection.
 *
 * NOTE ON NAMING: the YouTube Data API has no album entity. MUSICA therefore
 * presents real playlists as "Collections". We never label a video grouping as
 * an album, because no album metadata exists to back that claim.
 */
export function collectionFromYouTube(playlist) {
  if (!playlist?.playlistId) return null

  return {
    id: `${SOURCE_YOUTUBE}:playlist:${playlist.playlistId}`,
    kind: 'collection',
    sourceId: SOURCE_YOUTUBE,
    sourceCollectionId: playlist.playlistId,

    name: playlist.title || 'Untitled collection',
    description: playlist.description || '',
    artwork: playlist.artwork || '',
    artworkHigh: playlist.artworkHigh || '',
    curator: playlist.channelTitle || '',
    // null means "the API did not tell us", which the UI renders as no count at
    // all. It is never coerced to 0, because "0 songs" would be a false claim.
    itemCount: Number.isFinite(playlist.itemCount) ? playlist.itemCount : null,
    watchUrl: playlist.watchUrl || null,
  }
}

/**
 * Normalizes a first-party Playlist document into a Collection, so community
 * playlists and YouTube playlists appear together in one rail.
 */
export function collectionFromLocal(playlist, extra = {}) {
  if (!playlist) return null

  return {
    id: `${SOURCE_LOCAL}:${playlist._id}`,
    kind: 'collection',
    sourceId: SOURCE_LOCAL,
    sourceCollectionId: String(playlist._id),

    name: playlist.name || 'Untitled playlist',
    description: playlist.description || '',
    artwork: playlist.coverUrl || '',
    curator: extra.ownerName || '',
    itemCount: extra.songCount ?? playlist.songs?.length ?? 0,
    // Community playlists are playable inside MUSICA; YouTube collections open
    // in the official player via their playlist id.
    playable: true,
    playback: PLAYBACK_LOCAL_AUDIO,
    _id: String(playlist._id),
  }
}

/**
 * Groups tracks into artist cards, de-duplicating by sourceId + artistId so a
 * search returning ten videos from one channel yields one artist card.
 */
export function groupArtistsFromTracks(tracks, { maxArtists = 12 } = {}) {
  const byArtist = new Map()

  for (const track of tracks || []) {
    const key = `${track.sourceId}:${track.artistId || track.artist}`
    if (!byArtist.has(key)) {
      byArtist.set(key, {
        id: key,
        kind: 'artist',
        sourceId: track.sourceId,
        sourceArtistId: track.artistId || null,
        name: track.artist,
        // Channel artwork, not the video thumbnail: an artist should be
        // represented by the channel that owns the work.
        artwork: track.youtubeChannelArtwork || '',
        trackCount: 0,
        topTrackId: track.sourceTrackId,
        topTrackTitle: track.title,
        topTrackSourceId: track.sourceId,
      })
    }
    const entry = byArtist.get(key)
    entry.trackCount += 1
  }

  return [...byArtist.values()].slice(0, maxArtists)
}

export default {
  SOURCE_LOCAL,
  SOURCE_YOUTUBE,
  PLAYBACK_LOCAL_AUDIO,
  PLAYBACK_YOUTUBE_EMBED,
  trackFromLocal,
  trackFromYouTube,
  artistFromYouTube,
  collectionFromYouTube,
  collectionFromLocal,
  groupArtistsFromTracks,
}