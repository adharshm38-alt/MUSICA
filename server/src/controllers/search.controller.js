import Song from '../models/Song.js'
import User from '../models/User.js'
import Playlist from '../models/Playlist.js'
import asyncHandler from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/response.js'
import { decorateWithLikes } from '../utils/decorate.js'

const LIMIT = 24

/** Escapes user input before it goes into a RegExp. */
const escapeRegex = (text = '') => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * GET /api/search?q=...&type=all|songs|artists|albums|playlists
 *
 * Uses Mongo's weighted text index for songs/playlists and a regex for
 * users (people search by @username or display name).
 */
export const search = asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim()
  const type = req.query.type || 'all'

  if (!q) {
    return sendSuccess(res, {
      query: '',
      songs: [],
      artists: [],
      albums: [],
      playlists: [],
    })
  }

  const viewer = req.user?._id
  const wants = (key) => type === 'all' || type === key

  const jobs = {
    songs: wants('songs')
      ? Song.find(
          { isActive: true, $text: { $search: q } },
          { score: { $meta: 'textScore' } },
        )
          .sort({ score: { $meta: 'textScore' } })
          .limit(LIMIT)
          .lean()
      : null,

    artists: wants('artists')
      ? User.find({
          isActive: true,
          $or: [
            { username: new RegExp(escapeRegex(q), 'i') },
            { displayName: new RegExp(escapeRegex(q), 'i') },
          ],
        })
          .sort({ followerCount: -1 })
          .limit(LIMIT)
          .select('username displayName avatarUrl bio followerCount songCount')
          .lean()
      : null,

    albums: wants('albums')
      ? Song.aggregate([
          { $match: { isActive: true, album: { $regex: escapeRegex(q), $options: 'i' } } },
          {
            $group: {
              _id: '$album',
              songCount: { $sum: 1 },
              coverUrl: { $first: '$coverUrl' },
              artistName: { $first: '$artistName' },
              releaseYear: { $first: '$releaseYear' },
              totalPlays: { $sum: '$playCount' },
            },
          },
          { $match: { _id: { $ne: '' } } },
          { $sort: { totalPlays: -1 } },
          { $limit: LIMIT },
        ])
      : null,

    playlists: wants('playlists')
      ? Playlist.find(
          { isPublic: true, $text: { $search: q } },
          { score: { $meta: 'textScore' } },
        )
          .sort({ score: { $meta: 'textScore' } })
          .limit(LIMIT)
          .populate('owner', 'username displayName avatarUrl')
          .lean()
      : null,
  }

  const [songs, artists, albums, playlists] = await Promise.all([
    jobs.songs ?? [],
    jobs.artists ?? [],
    jobs.albums ?? [],
    jobs.playlists ?? [],
  ])

  return sendSuccess(res, {
    query: q,
    songs: await decorateWithLikes(songs, viewer),
    artists,
    albums: albums.map((album) => ({
      _id: album._id,
      name: album._id,
      coverUrl: album.coverUrl,
      artistName: album.artistName,
      songCount: album.songCount,
      releaseYear: album.releaseYear,
    })),
    playlists,
  })
})

/**
 * GET /api/search/suggest?q=... - lightweight type-ahead for the search box.
 */
export const suggest = asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim()
  if (!q) return sendSuccess(res, { songs: [], artists: [], playlists: [] })

  const [songs, artists, playlists] = await Promise.all([
    Song.find(
      { isActive: true, $text: { $search: q } },
      { score: { $meta: 'textScore' } },
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(5)
      .select('title artistName coverUrl duration')
      .lean(),
    User.find({
      isActive: true,
      $or: [
        { username: new RegExp(escapeRegex(q), 'i') },
        { displayName: new RegExp(escapeRegex(q), 'i') },
      ],
    })
      .limit(5)
      .select('username displayName avatarUrl')
      .lean(),
    Playlist.find({ isPublic: true, name: new RegExp(escapeRegex(q), 'i') })
      .limit(5)
      .select('name coverUrl')
      .lean(),
  ])

  return sendSuccess(res, { songs, artists, playlists })
})

export default { search, suggest }
