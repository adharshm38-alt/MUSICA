import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { usePlayer } from '../context/PlayerContext'
import { songsService, usersService } from '../services'
import { toFriendlyError } from '../services/api'

/**
 * Central place for like / follow actions so every card, row and profile
 * behaves the same and only one copy of the logic exists.
 */
export function useSocial() {
  const { isAuthenticated } = useAuth()
  const { currentSong, setLiked, setLikePending } = usePlayer()
  const toast = useToast()
  const navigate = useNavigate()

  const [busyIds, setBusyIds] = useState(new Set())

  // In-flight likes, kept in a ref (not state) so it is readable synchronously
  // inside toggleLike. Without this, clicking the heart repeatedly fires
  // overlapping requests whose responses arrive out of order and leave the UI
  // disagreeing with the database.
  const inFlight = useRef(new Set())

  const markBusy = useCallback((id, on) => {
    setBusyIds((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  /** Toggle a like. Keeps the player heart in sync when it is the active song. */
  const toggleLike = useCallback(
    async (song) => {
      if (!isAuthenticated) {
        toast.info('Log in to like songs.')
        navigate('/login')
        return false
      }

      // Ignore repeat clicks while a request for this song is still running.
      if (inFlight.current.has(song._id)) return Boolean(song.isLiked)
      inFlight.current.add(song._id)

      const wasLiked = Boolean(song.isLiked)

      // Optimistic update so the heart flips instantly.
      song.isLiked = !wasLiked
      song.likeCount = Math.max(0, (song.likeCount ?? 0) + (wasLiked ? -1 : 1))
      markBusy(song._id, true)

      // If this is the song in the player, move its heart too, and stop the
      // PlayerContext reconciliation effect from overwriting it mid-flight.
      const isCurrent = currentSong?._id === song._id
      if (isCurrent) {
        setLikePending(true)
        setLiked(song.isLiked ? song._id : null)
      }

      try {
        const result = wasLiked
          ? await songsService.unlike(song._id)
          : await songsService.like(song._id)

        song.likeCount = result.likeCount
        song.isLiked = result.isLiked
        return Boolean(result.isLiked)
      } catch (error) {
        // Roll the optimistic change back so the UI matches the server again.
        song.isLiked = wasLiked
        song.likeCount = Math.max(0, (song.likeCount ?? 0) + (wasLiked ? 1 : -1))
        if (isCurrent) setLiked(wasLiked ? song._id : null)
        toast.error(toFriendlyError(error))
        return wasLiked
      } finally {
        inFlight.current.delete(song._id)
        markBusy(song._id, false)
        if (isCurrent) setLikePending(false)
      }
    },
    [isAuthenticated, navigate, toast, markBusy, currentSong?._id, setLiked, setLikePending],
  )

  /** Toggle follow on a user/artist. */
  const toggleFollow = useCallback(
    async (profile) => {
      if (!isAuthenticated) {
        toast.info('Log in to follow artists.')
        navigate('/login')
        return false
      }

      // Ignore repeat clicks while a request for this profile is still running,
      // so rapid clicking cannot leave the UI disagreeing with the database.
      if (inFlight.current.has(profile._id)) return Boolean(profile.isFollowing)
      inFlight.current.add(profile._id)

      const wasFollowing = Boolean(profile.isFollowing)
      // Optimistic update so the button flips immediately.
      profile.isFollowing = !wasFollowing
      profile.followerCount = Math.max(0, (profile.followerCount ?? 0) + (wasFollowing ? -1 : 1))
      markBusy(profile._id, true)

      try {
        const result = wasFollowing
          ? await usersService.unfollow(profile._id)
          : await usersService.follow(profile._id)

        // Trust the server's counter so the UI always matches the database.
        profile.followerCount = result.followerCount
        profile.isFollowing = wasFollowing ? false : true
        toast.success(
          wasFollowing
            ? `Unfollowed ${profile.displayName || profile.username}`
            : `Following ${profile.displayName || profile.username}`,
        )
        return !wasFollowing
      } catch (error) {
        // Roll back so the UI matches the server again.
        profile.isFollowing = wasFollowing
        profile.followerCount = Math.max(0, (profile.followerCount ?? 0) + (wasFollowing ? 1 : -1))
        toast.error(toFriendlyError(error))
        return wasFollowing
      } finally {
        inFlight.current.delete(profile._id)
        markBusy(profile._id, false)
      }
    },
    [isAuthenticated, navigate, toast, markBusy],
  )

  return { toggleLike, toggleFollow, busyIds, isCurrentSong: (id) => currentSong?._id === id }
}

export default useSocial
