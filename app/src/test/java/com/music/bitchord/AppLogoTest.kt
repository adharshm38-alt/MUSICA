package com.music.bitchord

import com.music.bitchord.data.settings.AppLogo
import org.junit.Assert.assertEquals
import org.junit.Test

class AppLogoTest {

    @Test
    fun logosAreInExactUserSpecifiedOrder() {
        val all = AppLogo.ALL
        assertEquals(6, all.size)

        assertEquals("default", all[0].id)
        assertEquals("Default", all[0].displayName)
        assertEquals("LauncherDefault", all[0].alias)

        assertEquals("black", all[1].id)
        assertEquals("Black", all[1].displayName)
        assertEquals("LauncherBlack", all[1].alias)

        assertEquals("lavender", all[2].id)
        assertEquals("Lavender", all[2].displayName)
        assertEquals("LauncherLavender", all[2].alias)

        assertEquals("mint_green", all[3].id)
        assertEquals("Mint Green", all[3].displayName)
        assertEquals("LauncherMintGreen", all[3].alias)

        assertEquals("sky_blue", all[4].id)
        assertEquals("Sky Blue", all[4].displayName)
        assertEquals("LauncherSkyBlue", all[4].alias)

        assertEquals("pink", all[5].id)
        assertEquals("Pink", all[5].displayName)
        assertEquals("LauncherPink", all[5].alias)
    }

    @Test
    fun fromIdReturnsCorrectLogoOrFallsBackToDefault() {
        assertEquals(AppLogo.DEFAULT, AppLogo.fromId("default"))
        assertEquals(AppLogo.BLACK, AppLogo.fromId("black"))
        assertEquals(AppLogo.LAVENDER, AppLogo.fromId("lavender"))
        assertEquals(AppLogo.MINT_GREEN, AppLogo.fromId("mint_green"))
        assertEquals(AppLogo.SKY_BLUE, AppLogo.fromId("sky_blue"))
        assertEquals(AppLogo.PINK, AppLogo.fromId("pink"))

        // Fallbacks
        assertEquals(AppLogo.DEFAULT, AppLogo.fromId(null))
        assertEquals(AppLogo.DEFAULT, AppLogo.fromId(""))
        assertEquals(AppLogo.DEFAULT, AppLogo.fromId("unknown_logo"))
    }
}
