package com.music.bitchord.data.settings

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import com.music.bitchord.R

/**
 * Six selectable MUSICA app logo variants.
 *
 * Exactly one activity-alias is enabled at a time on Android launcher.
 */
enum class AppLogo(
    val id: String,
    val displayName: String,
    val subtitle: String,
    val alias: String,
    val previewRes: Int,
    val iconRes: Int,
    val roundIconRes: Int,
) {
    DEFAULT(
        id = "default",
        displayName = "Default",
        subtitle = "Original red squircle",
        alias = "LauncherDefault",
        previewRes = R.drawable.app_logo_default,
        iconRes = R.mipmap.ic_launcher,
        roundIconRes = R.mipmap.ic_launcher_round,
    ),
    BLACK(
        id = "black",
        displayName = "Black",
        subtitle = "Minimalist pure black",
        alias = "LauncherBlack",
        previewRes = R.drawable.app_logo_black,
        iconRes = R.mipmap.ic_launcher_black,
        roundIconRes = R.mipmap.ic_launcher_black_round,
    ),
    LAVENDER(
        id = "lavender",
        displayName = "Lavender",
        subtitle = "Soft pastel purple",
        alias = "LauncherLavender",
        previewRes = R.drawable.app_logo_lavender,
        iconRes = R.mipmap.ic_launcher_lavender,
        roundIconRes = R.mipmap.ic_launcher_lavender_round,
    ),
    MINT_GREEN(
        id = "mint_green",
        displayName = "Mint Green",
        subtitle = "Fresh pastel green",
        alias = "LauncherMintGreen",
        previewRes = R.drawable.app_logo_mint_green,
        iconRes = R.mipmap.ic_launcher_mint_green,
        roundIconRes = R.mipmap.ic_launcher_mint_green_round,
    ),
    SKY_BLUE(
        id = "sky_blue",
        displayName = "Sky Blue",
        subtitle = "Calm pastel blue",
        alias = "LauncherSkyBlue",
        previewRes = R.drawable.app_logo_sky_blue,
        iconRes = R.mipmap.ic_launcher_sky_blue,
        roundIconRes = R.mipmap.ic_launcher_sky_blue_round,
    ),
    PINK(
        id = "pink",
        displayName = "Pink",
        subtitle = "Vibrant pastel pink",
        alias = "LauncherPink",
        previewRes = R.drawable.app_logo_pink,
        iconRes = R.mipmap.ic_launcher_pink,
        roundIconRes = R.mipmap.ic_launcher_pink_round,
    );

    fun component(context: Context): ComponentName =
        ComponentName(context.packageName, "com.music.bitchord.$alias")

    companion object {
        val ALL = entries.toList()

        fun fromId(id: String?): AppLogo {
            return entries.firstOrNull { it.id.equals(id, ignoreCase = true) } ?: DEFAULT
        }

        fun current(context: Context): AppLogo {
            val pm = context.packageManager
            return entries.firstOrNull {
                pm.getComponentEnabledSetting(it.component(context)) ==
                    PackageManager.COMPONENT_ENABLED_STATE_ENABLED
            } ?: DEFAULT
        }

        /**
         * Enables [logo] before disabling other aliases so there is never a moment with no launcher entry.
         */
        fun apply(context: Context, logo: AppLogo) {
            val pm = context.packageManager
            val packageName = context.packageName

            // 1. Enable chosen alias
            pm.setComponentEnabledSetting(
                logo.component(context),
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                PackageManager.DONT_KILL_APP,
            )

            // 2. Disable other logo aliases
            entries.filter { it != logo }.forEach { other ->
                runCatching {
                    pm.setComponentEnabledSetting(
                        other.component(context),
                        PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                        PackageManager.DONT_KILL_APP,
                    )
                }
            }

            // 3. Disable any old legacy aliases if present
            val legacyAliases = listOf(
                "LauncherMonochrome", "LauncherGlassLight", "LauncherGlassDark",
                "LauncherGlassClear", "LauncherGlassClearDark", "LauncherSamsungGlass",
                "LauncherSamsungGlassDark", "LauncherSamsungGlassClear", "LauncherSamsungGlassClearDark",
                "LauncherPixelGlass", "LauncherPixelGlassDark", "LauncherPixelGlassClear",
                "LauncherPixelGlassClearDark", "NeonSilver", "LauncherNeonSilver", "LauncherNeonCyan",
                "LauncherNeonViolet", "LauncherSamsungNeonSilver", "LauncherSamsungNeonCyan",
                "LauncherSamsungNeonViolet", "LauncherPixelNeonSilver", "LauncherPixelNeonCyan",
                "LauncherPixelNeonViolet",
            )
            legacyAliases.forEach { legacy ->
                runCatching {
                    pm.setComponentEnabledSetting(
                        ComponentName(packageName, "com.music.bitchord.$legacy"),
                        PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                        PackageManager.DONT_KILL_APP,
                    )
                }
            }
        }
    }
}
