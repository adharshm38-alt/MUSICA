package com.music.bitchord.ui.screens

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import com.music.bitchord.R
import com.music.bitchord.data.OfflinePlaylist
import com.music.bitchord.data.OfflinePlaylists
import com.music.bitchord.data.model.PlaylistPrivacy
import com.music.bitchord.data.model.UserPlaylist
import com.music.bitchord.ui.components.BrowseTarget
import com.music.bitchord.ui.components.PlaylistCoverConfirmDialog
import com.music.bitchord.ui.components.PlaylistPickerSheet
import com.music.bitchord.ui.components.SpotifyImportAlert
import dev.chrisbanes.haze.HazeState
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import com.music.bitchord.data.auth.ProtonSession
import com.music.bitchord.data.model.Account
import com.music.bitchord.data.model.HomeShelf
import com.music.bitchord.data.model.ShelfItem
import com.music.bitchord.data.model.Song
import com.music.bitchord.data.model.TopPick
import com.music.bitchord.data.model.TopPickMood
import com.music.bitchord.data.model.UiState
import com.music.bitchord.data.model.VideoDiscoveryItem
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.music.bitchord.data.settings.AppSettings
import com.music.bitchord.data.settings.AppWallpaper
import com.music.bitchord.data.settings.BitPerfectMode
import com.music.bitchord.data.sources.SourceConfig
import com.music.bitchord.ui.components.DownloadManagerPage
import com.music.bitchord.ui.discovery.DiscoveryCardPreviewSurface
import com.music.bitchord.ui.discovery.DiscoveryPreviewPool
import com.music.bitchord.ui.discovery.FullMusicVideoScreen
import com.music.bitchord.ui.discovery.VideoDiscoveryFeedScreen
import com.music.bitchord.ui.navigation.AppRoute
import com.music.bitchord.ui.toppreview.TopPreviewFullScreen
import com.music.bitchord.ui.toppreview.TopPreviewPlayer
import com.music.bitchord.ui.toppreview.TopPreviewSurface
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshState

/**
 * Checks whether an [AppRoute] belongs to the Settings or secondary auxiliary screens hierarchy.
 */
fun AppRoute.isSettingsOrAuxiliaryRoute(): Boolean = when (this) {
    AppRoute.Settings,
    is AppRoute.SettingsSection,
    is AppRoute.SettingsChoice,
    AppRoute.AboutDetails,
    AppRoute.ExtraChanges,
    AppRoute.AppLogos,
    AppRoute.Backgrounds,
    AppRoute.AccountScrobbling,
    AppRoute.Sources,
    AppRoute.Downloads,
    AppRoute.WearOs,
    AppRoute.ListenTogether,
    AppRoute.Equalizer,
    AppRoute.EqualizerPresets -> true
    else -> false
}

/**
 * Dedicated route host for Settings and related auxiliary pages to keep BitChordApp method size
 * well within the JVM 64KB method limit.
 */
@Composable
fun SettingsAndAuxiliaryRouteHost(
    pageRoute: AppRoute,
    onPop: () -> Unit,
    onOpenSection: (SettingsCategory) -> Unit,
    onOpenChoice: (SettingsChoiceKind) -> Unit,
    onOpenAboutDetails: () -> Unit,
    onOpenExtraChanges: () -> Unit,
    onOpenAppLogos: () -> Unit,
    onOpenBackgrounds: () -> Unit,
    onOpenDiscord: () -> Unit,
    onOpenSpotify: () -> Unit,
    onAccountScrobbling: () -> Unit,
    onEqualizer: () -> Unit,
    onOpenPresets: () -> Unit,
    onOpenReplay: () -> Unit,
    onSources: () -> Unit,
    onListenTogether: () -> Unit,
    onWearOs: () -> Unit,
    windowWidth: Dp,
    signedIn: Boolean,
    account: Account?,
    protonSession: ProtonSession?,
    selectedChannelName: String?,
    activeJamInviteCode: String?,
    activeJamInviteServer: String?,
    onSignIn: () -> Unit,
    onSignOut: () -> Unit,
    onSwitchChannel: () -> Unit,
    onSignInProton: () -> Unit,
    onSignOutProton: () -> Unit,
    onSyncProton: () -> Unit,
    onOpenListenBrainzLogin: () -> Unit,
    onOpenLastfmLogin: () -> Unit,
    onEditSource: (SourceConfig) -> Unit,
    onChooseSourceQuality: (SourceConfig) -> Unit,
    onExplainOutdatedAddon: (SourceConfig) -> Unit,
    onEditWebDav: () -> Unit,
    onEditSmb: () -> Unit,
    onConfirmJioSaavn: () -> Unit,
    onInviteHandled: () -> Unit,
    onEditPartyServer: () -> Unit,
    onConfirmBitPerfect: (BitPerfectMode) -> Unit,
    onConfirmFixedVolume: () -> Unit,
    onLyricsSources: () -> Unit,
    onTranslationLanguage: () -> Unit,
    onSpotifyCanvasAuth: () -> Unit,
    onAppLanguage: () -> Unit,
    onEditSignatureApi: () -> Unit,
    contentPadding: PaddingValues,
) {
    when (pageRoute) {
        AppRoute.AccountScrobbling -> {
            AccountAndScrobblingScreen(
                signedIn = signedIn,
                account = account,
                channelName = selectedChannelName,
                onSignIn = onSignIn,
                onSwitchChannel = onSwitchChannel,
                onSignOut = onSignOut,
                protonSession = protonSession,
                onSignInProton = onSignInProton,
                onSignOutProton = onSignOutProton,
                onSyncProton = onSyncProton,
                onOpenListenBrainzLogin = onOpenListenBrainzLogin,
                onOpenLastfmLogin = onOpenLastfmLogin,
                onOpenDiscord = onOpenDiscord,
                onOpenSpotify = onOpenSpotify,
                contentPadding = contentPadding,
            )
        }
        AppRoute.Sources -> {
            SourcesScreen(
                contentPadding = contentPadding,
                onEditSource = onEditSource,
                onChooseSourceQuality = onChooseSourceQuality,
                onExplainOutdatedAddon = onExplainOutdatedAddon,
                onEditWebDav = onEditWebDav,
                onEditSmb = onEditSmb,
                onConfirmJioSaavn = onConfirmJioSaavn,
            )
        }
        AppRoute.Downloads -> {
            DownloadManagerPage(
                onCleared = onPop,
                contentPadding = contentPadding,
            )
        }
        AppRoute.WearOs -> {
            WearOsScreen(contentPadding = contentPadding)
        }
        AppRoute.ListenTogether -> {
            ListenTogetherScreen(
                signedIn = signedIn,
                inviteCode = activeJamInviteCode,
                inviteServer = activeJamInviteServer,
                onInviteHandled = onInviteHandled,
                onSignIn = onSignIn,
                contentPadding = contentPadding,
                onEditServer = onEditPartyServer,
            )
        }
        AppRoute.Equalizer -> {
            EqualizerScreen(
                contentPadding = contentPadding,
                onOpenPresets = onOpenPresets,
            )
        }
        AppRoute.EqualizerPresets -> {
            EqualizerPresetPage(
                onChosen = onPop,
                contentPadding = contentPadding,
            )
        }
        is AppRoute.SettingsChoice -> {
            SettingsChoicePage(
                choice = pageRoute.choice,
                onChosen = onPop,
                onConfirmBitPerfect = onConfirmBitPerfect,
                contentPadding = contentPadding,
            )
        }
        AppRoute.AboutDetails -> {
            AboutDetailsScreen(
                contentPadding = contentPadding,
            )
        }
        AppRoute.ExtraChanges -> {
            ExtraChangesScreen(
                onOpenAppLogos = onOpenAppLogos,
                onOpenBackgrounds = onOpenBackgrounds,
                contentPadding = contentPadding,
            )
        }
        AppRoute.AppLogos -> {
            AppLogosScreen(
                contentPadding = contentPadding,
            )
        }
        AppRoute.Backgrounds -> {
            BackgroundsGalleryScreen(
                contentPadding = contentPadding,
            )
        }
        AppRoute.Settings, is AppRoute.SettingsSection -> {
            SettingsScreen(
                section = (pageRoute as? AppRoute.SettingsSection)?.category,
                onOpenSection = onOpenSection,
                onOpenChoice = onOpenChoice,
                onOpenAboutDetails = onOpenAboutDetails,
                onOpenExtraChanges = onOpenExtraChanges,
                onOpenDiscord = onOpenDiscord,
                windowWidth = windowWidth,
                signedIn = signedIn,
                account = account,
                onSignIn = onSignIn,
                onSignOut = onSignOut,
                onAccountScrobbling = onAccountScrobbling,
                onEqualizer = onEqualizer,
                onOpenReplay = onOpenReplay,
                onLyricsSources = onLyricsSources,
                onTranslationLanguage = onTranslationLanguage,
                onSources = onSources,
                onListenTogether = onListenTogether,
                onWearOs = onWearOs,
                onSpotifyCanvasAuth = onSpotifyCanvasAuth,
                onAppLanguage = onAppLanguage,
                onEditSignatureApi = onEditSignatureApi,
                onConfirmBitPerfect = onConfirmBitPerfect,
                onConfirmFixedVolume = onConfirmFixedVolume,
                contentPadding = contentPadding,
            )
        }
        else -> Unit
    }
}

/**
 * Extracted HomeScreen host composable to keep BitChordApp within the 64KB JVM bytecode limit.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainHomeScreenHost(
    state: UiState<List<HomeShelf>>,
    listState: LazyListState,
    currentSong: Song?,
    isPlaying: Boolean,
    title: String?,
    festiveLogo: Boolean,
    onFestiveLogoClick: (() -> Unit)?,
    signedIn: Boolean,
    onSignIn: (() -> Unit)?,
    onItemClick: (ShelfItem, String) -> Unit,
    onItemLongPress: ((ShelfItem) -> Unit)?,
    onRetry: () -> Unit,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    pullState: PullToRefreshState,
    contentPadding: PaddingValues,
    onLoadMore: (() -> Unit)?,
    loadingMore: Boolean,
    recentlyPlayedLoading: Boolean,
    topPicks: List<TopPick>?,
    topPicksLoading: Boolean,
    listenerName: String?,
    onRefreshTopPicks: (() -> Unit)?,
    onTopPickClick: ((TopPick, String) -> Unit)?,
    onMoodClick: ((TopPickMood, String) -> Unit)?,
    onMoodsShowAll: () -> Unit,
    artworkMotion: Boolean,
    topPreviewItems: List<VideoDiscoveryItem>,
    topPreviewLoading: Boolean,
    onTopPreviewClick: ((VideoDiscoveryItem) -> Unit)?,
    isHomeVisible: Boolean,
    topPreviewPlayer: TopPreviewPlayer,
    topPreviewIsMuted: Boolean,
    onTopPreviewToggleMute: () -> Unit,
    topPreviewIsPlaying: Boolean,
    onTopPreviewTogglePlayPause: () -> Unit,
    topPreviewPositionMs: Long,
    topPreviewDurationMs: Long,
    onTopPreviewMoreClick: ((VideoDiscoveryItem) -> Unit)?,
    videoDiscoveryItems: List<VideoDiscoveryItem>,
    videoDiscoveryLoading: Boolean,
    onVideoDiscoveryClick: (VideoDiscoveryItem) -> Unit,
    discoveryPreviewPool: DiscoveryPreviewPool,
    onTopPickLongPress: ((TopPick) -> Unit)?,
) {
    HomeScreen(
        state = state,
        listState = listState,
        currentSong = currentSong,
        isPlaying = isPlaying,
        title = title,
        festiveLogo = festiveLogo,
        onFestiveLogoClick = onFestiveLogoClick,
        signedIn = signedIn,
        onSignIn = onSignIn,
        onItemClick = onItemClick,
        onItemLongPress = onItemLongPress,
        onRetry = onRetry,
        refreshing = refreshing,
        onRefresh = onRefresh,
        pullState = pullState,
        contentPadding = contentPadding,
        onLoadMore = onLoadMore,
        loadingMore = loadingMore,
        recentlyPlayedLoading = recentlyPlayedLoading,
        topPicks = topPicks,
        topPicksLoading = topPicksLoading,
        listenerName = listenerName,
        onRefreshTopPicks = onRefreshTopPicks,
        onTopPickClick = onTopPickClick,
        onMoodClick = onMoodClick,
        onMoodsShowAll = onMoodsShowAll,
        artworkMotion = artworkMotion,
        topPreviewItems = topPreviewItems,
        topPreviewLoading = topPreviewLoading,
        onTopPreviewClick = onTopPreviewClick,
        topPreviewSlot = { videoId, active, mod ->
            TopPreviewSurface(
                videoId = videoId,
                active = active && isHomeVisible,
                player = topPreviewPlayer,
                modifier = mod,
            )
        },
        topPreviewIsMuted = topPreviewIsMuted,
        onTopPreviewToggleMute = onTopPreviewToggleMute,
        topPreviewIsPlaying = topPreviewIsPlaying,
        onTopPreviewTogglePlayPause = onTopPreviewTogglePlayPause,
        topPreviewPositionMs = topPreviewPositionMs,
        topPreviewDurationMs = topPreviewDurationMs,
        onTopPreviewMoreClick = onTopPreviewMoreClick,
        videoDiscoveryItems = videoDiscoveryItems,
        videoDiscoveryLoading = videoDiscoveryLoading,
        onVideoDiscoveryClick = onVideoDiscoveryClick,
        videoDiscoveryPreview = { videoId, active, mod ->
            DiscoveryCardPreviewSurface(
                videoId = videoId,
                active = active && isHomeVisible,
                pool = discoveryPreviewPool,
                modifier = mod,
            )
        },
        videoDiscoveryIsMuted = discoveryPreviewPool.isMuted.collectAsStateWithLifecycle().value,
        onVideoDiscoveryToggleMute = discoveryPreviewPool::toggleMute,
        onTopPickLongPress = onTopPickLongPress,
    )
}

/**
 * Renders the custom wallpaper behind app surfaces.
 * Pure black by default; renders the selected wallpaper image with an elegant dark overlay when set.
 */
@Composable
fun AppBackgroundWallpaper(
    wallpaper: AppWallpaper = AppSettings.customWallpaper.collectAsStateWithLifecycle().value,
    modifier: Modifier = Modifier,
) {
    if (wallpaper != AppWallpaper.DEFAULT_BLACK && wallpaper.drawableRes != null) {
        Box(modifier = modifier.fillMaxSize()) {
            Image(
                painter = painterResource(wallpaper.drawableRes),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.44f)),
            )
        }
    }
}

@Composable
fun VideoDiscoveryFeedRouteHost(
    items: List<VideoDiscoveryItem>,
    initialVideoId: String,
    isActiveRoute: Boolean,
    isMusicCurrentlyPlaying: Boolean,
    onRequestPauseBackgroundMusic: () -> Unit,
    onEnsureMetadata: (VideoDiscoveryItem) -> Unit,
    onToggleFollow: (VideoDiscoveryItem) -> Unit,
    onAddToPlaylist: (VideoDiscoveryItem) -> Unit,
    onOpenFullVideo: (VideoDiscoveryItem, Long) -> Unit,
    onBack: () -> Unit,
    context: Context,
) {
    val shareDiscoveryItem: (VideoDiscoveryItem) -> Unit = { item ->
        val sendIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(
                Intent.EXTRA_TEXT,
                "${item.title} — ${item.artist}\nhttps://music.youtube.com/watch?v=${item.videoId}",
            )
        }
        context.startActivity(Intent.createChooser(sendIntent, item.title))
    }

    VideoDiscoveryFeedScreen(
        items = items,
        initialVideoId = initialVideoId,
        isActiveRoute = isActiveRoute,
        isMusicCurrentlyPlaying = isMusicCurrentlyPlaying,
        onRequestPauseBackgroundMusic = onRequestPauseBackgroundMusic,
        onEnsureMetadata = onEnsureMetadata,
        onToggleFollow = onToggleFollow,
        onShare = shareDiscoveryItem,
        onAddToPlaylist = onAddToPlaylist,
        onOpenFullVideo = onOpenFullVideo,
        onBack = onBack,
    )
}

@Composable
fun FullMusicVideoRouteHost(
    items: List<VideoDiscoveryItem>,
    videoId: String,
    initialSeekMs: Long,
    onRequestPauseBackgroundMusic: () -> Unit,
    onAddToPlaylist: (VideoDiscoveryItem) -> Unit,
    onOpenInAudioPlayer: (VideoDiscoveryItem, () -> Unit) -> Unit,
    onBack: () -> Unit,
    context: Context,
) {
    val targetItem = items.firstOrNull { it.videoId == videoId }
    if (targetItem != null) {
        FullMusicVideoScreen(
            item = targetItem,
            initialSeekMs = initialSeekMs,
            onRequestPauseBackgroundMusic = onRequestPauseBackgroundMusic,
            onAddToPlaylist = onAddToPlaylist,
            onShare = { item ->
                val sendIntent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(
                        Intent.EXTRA_TEXT,
                        "${item.title} — ${item.artist}\nhttps://music.youtube.com/watch?v=${item.videoId}",
                    )
                }
                context.startActivity(Intent.createChooser(sendIntent, item.title))
            },
            onOpenInAudioPlayer = onOpenInAudioPlayer,
            onBack = onBack,
        )
    } else {
        LaunchedEffect(Unit) { onBack() }
    }
}

@Composable
fun TopPreviewFullScreenRouteHost(
    topPreviewItems: List<VideoDiscoveryItem>,
    homeVideoDiscovery: List<VideoDiscoveryItem>,
    videoId: String,
    player: TopPreviewPlayer,
    onRequestPauseBackgroundMusic: () -> Unit,
    onListenNow: (VideoDiscoveryItem) -> Unit,
    onBack: () -> Unit,
) {
    val targetItem = topPreviewItems.firstOrNull { it.videoId == videoId }
        ?: homeVideoDiscovery.firstOrNull { it.videoId == videoId }
    if (targetItem != null) {
        TopPreviewFullScreen(
            item = targetItem,
            player = player,
            onRequestPauseBackgroundMusic = onRequestPauseBackgroundMusic,
            onListenNow = onListenNow,
            onBack = onBack,
        )
    } else {
        LaunchedEffect(Unit) { onBack() }
    }
}

/**
 * Extracted playlist pickers and cover confirm dialogs to keep BitChordApp within bytecode limits.
 */
@Composable
fun MainPlaylistDialogsHost(
    playlistTarget: Song?,
    creatingPlaylist: Boolean,
    onDismissPlaylistPicker: () -> Unit,
    playlists: List<UserPlaylist>,
    playlistsLoading: Boolean,
    onAddToPlaylists: (List<UserPlaylist>, Song) -> Unit,
    onCreatePlaylist: (String, PlaylistPrivacy, Song?) -> Unit,
    offlinePlaylistTarget: Song?,
    creatingOfflinePlaylist: Boolean,
    onDismissOfflinePlaylistPicker: () -> Unit,
    offlinePlaylists: List<OfflinePlaylist>,
    onAddToOfflinePlaylists: (List<UserPlaylist>, Song) -> Unit,
    onCreateOfflinePlaylist: (String, Song?) -> Unit,
    showSpotifyImportDialog: Boolean,
    onDismissSpotifyImport: () -> Unit,
    hazeState: HazeState,
    signedIn: Boolean,
    onSpotifyImported: (String, PlaylistPrivacy, List<Song>) -> Unit,
    pendingCoverTarget: BrowseTarget?,
    pendingCoverUri: Uri?,
    savingCustomCover: Boolean,
    onConfirmCustomCover: () -> Unit,
    onCancelCustomCover: () -> Unit,
    context: Context,
) {
    if (playlistTarget != null || creatingPlaylist) {
        val target = playlistTarget
        PlaylistPickerSheet(
            playlists = playlists,
            loading = playlistsLoading,
            song = target,
            startCreating = target == null,
            onDismiss = onDismissPlaylistPicker,
            onAdd = { picked ->
                target?.let { song ->
                    onAddToPlaylists(picked, song)
                }
            },
            onCreate = { title, privacy ->
                onCreatePlaylist(title, privacy, target)
            },
        )
    }

    if (offlinePlaylistTarget != null || creatingOfflinePlaylist) {
        val target = offlinePlaylistTarget
        val choices = remember(offlinePlaylists) {
            offlinePlaylists.map { playlist ->
                UserPlaylist(
                    playlistId = playlist.id,
                    title = playlist.title,
                    subtitle = context.resources.getQuantityString(
                        R.plurals.song_count_plural,
                        playlist.songs.size,
                        playlist.songs.size,
                    ),
                    thumbnailUrl = playlist.songs.firstNotNullOfOrNull { it.thumbnailUrl }
                        .takeUnless { playlist.isLiked },
                )
            }
        }
        PlaylistPickerSheet(
            playlists = choices,
            loading = false,
            song = target,
            startCreating = target == null,
            offline = true,
            onDismiss = onDismissOfflinePlaylistPicker,
            onAdd = { picked ->
                target?.let { song ->
                    onAddToOfflinePlaylists(picked, song)
                }
            },
            onCreate = { title, _ ->
                onCreateOfflinePlaylist(title, target)
            },
        )
    }

    if (showSpotifyImportDialog) {
        BackHandler { onDismissSpotifyImport() }
        SpotifyImportAlert(
            hazeState = hazeState,
            signedIn = signedIn,
            onImported = onSpotifyImported,
            onDismiss = onDismissSpotifyImport,
        )
    }

    val coverTarget = pendingCoverTarget
    val coverUri = pendingCoverUri
    if (coverTarget != null && coverUri != null) {
        PlaylistCoverConfirmDialog(
            playlistTitle = coverTarget.title,
            imageUri = coverUri,
            saving = savingCustomCover,
            onConfirm = onConfirmCustomCover,
            onCancel = onCancelCustomCover,
        )
    }
}
