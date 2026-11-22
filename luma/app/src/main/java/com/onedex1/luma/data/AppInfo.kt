package com.onedex1.luma.data

import androidx.compose.runtime.Immutable

/**
 * A launchable activity of the main user.
 *
 * @property key `ComponentName.flattenToString()` — stable id used by [LayoutStore] and
 *   [AppRepository.loadIcon] / [AppRepository.launch].
 */
@Immutable
data class AppInfo(
    val key: String,
    val packageName: String,
    val className: String,
    val label: String,
)
