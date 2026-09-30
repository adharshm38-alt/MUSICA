import Like from '../models/Like.js'
import Follow from '../models/Follow.js'

/**
 * Adds `isLiked` to each song when a user is present, so the client can
 * render filled hearts without extra requests.
 *
 * @param {Array} songs plain song documents
 * @param {string|undefined} userId current viewer
 * @returns {Promise<Array>} the same songs, with `isLiked` set
 */
export async function decorateWithLikes(songs, userId) {
  if (!songs?.length) return []
  if (!userId) return songs.map((song) => ({ ...song, isLiked: false }))

  const ids = songs.map((song) => song._id)
  const likes = await Like.find({ user: userId, song: { $in: ids } }).select('song')
  const likedIds = new Set(likes.map((like) => like.song.toString()))

  return songs.map((song) => ({ ...song, isLiked: likedIds.has(song._id.toString()) }))
}

/**
 * Adds `isFollowing` to each user for the given viewer.
 */
export async function decorateWithFollow(users, viewerId) {
  if (!users?.length) return []
  if (!viewerId) return users.map((user) => ({ ...user, isFollowing: false }))

  const ids = users.map((user) => user._id)
  const follows = await Follow.find({ follower: viewerId, following: { $in: ids } }).select('following')
  const followedIds = new Set(follows.map((follow) => follow.following.toString()))

  return users.map((user) => ({ ...user, isFollowing: followedIds.has(user._id.toString()) }))
}
