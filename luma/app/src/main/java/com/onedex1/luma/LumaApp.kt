package com.onedex1.luma

import android.app.Application
import android.content.Context
import com.onedex1.luma.data.AppRepository
import com.onedex1.luma.data.LayoutStore
import com.onedex1.luma.data.SettingsStore
import com.onedex1.luma.glass.WallpaperEngine

/**
 * Process-wide singletons. Everything is created lazily on first use, so the
 * application starts instantly and only pays for what the current screen needs.
 */
class LumaApp : Application() {

    val appRepository: AppRepository by lazy { AppRepository(this) }

    val layoutStore: LayoutStore by lazy { LayoutStore(this) }

    val settingsStore: SettingsStore by lazy { SettingsStore(this) }

    val wallpaperEngine: WallpaperEngine by lazy { WallpaperEngine(this) }
}

/** The [LumaApp] instance behind any [Context]. */
val Context.lumaApp: LumaApp
    get() = applicationContext as LumaApp
