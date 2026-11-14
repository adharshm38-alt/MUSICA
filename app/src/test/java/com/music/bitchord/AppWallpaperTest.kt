package com.music.bitchord

import com.music.bitchord.data.settings.AppWallpaper
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class AppWallpaperTest {

    @Test
    fun wallpapersAreInExactUserSpecifiedOrder() {
        val all = AppWallpaper.ALL
        assertEquals(6, all.size)

        assertEquals("default_black", all[0].id)
        assertEquals("Default Black", all[0].displayName)
        assertNull(all[0].drawableRes)

        assertEquals("anime_green_tree", all[1].id)
        assertEquals("Anime Green Tree", all[1].displayName)
        assertNotNull(all[1].drawableRes)

        assertEquals("golden_forest_light", all[2].id)
        assertEquals("Golden Forest Light", all[2].displayName)
        assertNotNull(all[2].drawableRes)

        assertEquals("forest_canopy", all[3].id)
        assertEquals("Forest Canopy", all[3].displayName)
        assertNotNull(all[3].drawableRes)

        assertEquals("mount_fuji_journey", all[4].id)
        assertEquals("Mount Fuji Journey", all[4].displayName)
        assertNotNull(all[4].drawableRes)

        assertEquals("artistic_text", all[5].id)
        assertEquals("Artistic Text", all[5].displayName)
        assertNotNull(all[5].drawableRes)
    }

    @Test
    fun fromIdReturnsCorrectWallpaperOrFallsBackToDefaultBlack() {
        assertEquals(AppWallpaper.DEFAULT_BLACK, AppWallpaper.fromId("default_black"))
        assertEquals(AppWallpaper.ANIME_GREEN_TREE, AppWallpaper.fromId("anime_green_tree"))
        assertEquals(AppWallpaper.GOLDEN_FOREST_LIGHT, AppWallpaper.fromId("golden_forest_light"))
        assertEquals(AppWallpaper.FOREST_CANOPY, AppWallpaper.fromId("forest_canopy"))
        assertEquals(AppWallpaper.MOUNT_FUJI_JOURNEY, AppWallpaper.fromId("mount_fuji_journey"))
        assertEquals(AppWallpaper.ARTISTIC_TEXT, AppWallpaper.fromId("artistic_text"))

        // Fallbacks
        assertEquals(AppWallpaper.DEFAULT_BLACK, AppWallpaper.fromId(null))
        assertEquals(AppWallpaper.DEFAULT_BLACK, AppWallpaper.fromId(""))
        assertEquals(AppWallpaper.DEFAULT_BLACK, AppWallpaper.fromId("non_existent_wallpaper"))
    }
}
