package com.music.bitchord.data.settings

import androidx.annotation.DrawableRes
import com.music.bitchord.R

/**
 * Custom application background wallpapers for MUSICA.
 *
 * Ordered strictly per user specification:
 * 1. Default Black - Original MUSICA pure black
 * 2. Anime Green Tree - First uploaded wallpaper
 * 3. Golden Forest Light - Second uploaded wallpaper
 * 4. Forest Canopy - Third uploaded wallpaper
 * 5. Mount Fuji Journey - Fourth uploaded wallpaper
 * 6. Artistic Text - Fifth uploaded wallpaper
 */
enum class AppWallpaper(
    val id: String,
    val displayName: String,
    @param:DrawableRes val drawableRes: Int?,
    val description: String,
) {
    DEFAULT_BLACK(
        id = "default_black",
        displayName = "Default Black",
        drawableRes = null,
        description = "Original MUSICA pure black",
    ),
    ANIME_GREEN_TREE(
        id = "anime_green_tree",
        displayName = "Anime Green Tree",
        drawableRes = R.drawable.wallpaper_anime_green_tree,
        description = "Vibrant lush canopy",
    ),
    GOLDEN_FOREST_LIGHT(
        id = "golden_forest_light",
        displayName = "Golden Forest Light",
        drawableRes = R.drawable.wallpaper_golden_forest_light,
        description = "Sunbeams through majestic woods",
    ),
    FOREST_CANOPY(
        id = "forest_canopy",
        displayName = "Forest Canopy",
        drawableRes = R.drawable.wallpaper_forest_canopy,
        description = "Towering sequoias upward view",
    ),
    MOUNT_FUJI_JOURNEY(
        id = "mount_fuji_journey",
        displayName = "Mount Fuji Journey",
        drawableRes = R.drawable.wallpaper_mount_fuji_journey,
        description = "Train station with snow-capped peak",
    ),
    ARTISTIC_TEXT(
        id = "artistic_text",
        displayName = "Artistic Text",
        drawableRes = R.drawable.wallpaper_artistic_text,
        description = "Minimalist typographic calligraphy",
    ),
    ;

    companion object {
        val ALL: List<AppWallpaper> = entries.toList()

        fun fromId(id: String?): AppWallpaper {
            if (id.isNullOrBlank()) return DEFAULT_BLACK
            return entries.firstOrNull { it.id == id } ?: DEFAULT_BLACK
        }
    }
}
