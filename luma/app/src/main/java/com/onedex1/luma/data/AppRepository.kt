package com.onedex1.luma.data

import android.content.ComponentCallbacks2
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.LauncherActivityInfo
import android.content.pm.LauncherApps
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Rect
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.os.UserHandle
import android.provider.Settings
import android.util.DisplayMetrics
import android.util.Log
import android.util.LruCache
import android.widget.Toast
import androidx.annotation.StringRes
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.core.content.edit
import androidx.core.graphics.createBitmap
import com.onedex1.luma.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.isActive
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.text.Collator
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

/**
 * Source of truth for the launchable apps of the main user.
 *
 * * [apps] starts with the list cached from the previous run (so the home screen is never
 *   empty on a cold start) and is refreshed from [LauncherApps] right away and on every
 *   install / uninstall / update / locale change.
 * * Icons are rendered off the main thread and kept in a byte-bounded LRU cache.
 * * All intent launches are guarded; failures show a short Russian toast instead of crashing.
 */
class AppRepository(context: Context) {

    private val appContext: Context = context.applicationContext
    private val launcherApps: LauncherApps? = appContext.getSystemService(LauncherApps::class.java)
    private val user: UserHandle = Process.myUserHandle()
    private val selfPackage: String = appContext.packageName
    private val mainHandler = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val cachePrefs = appContext.getSharedPreferences(CACHE_PREFS, Context.MODE_PRIVATE)

    private val _apps = MutableStateFlow(readCachedApps())

    /** Launchable apps sorted by label (locale-aware), Luma itself excluded. */
    val apps: StateFlow<List<AppInfo>> = _apps.asStateFlow()

    private val _iconsVersion = MutableStateFlow(0)

    /**
     * Bumped whenever cached icons were dropped because a package changed (update, icon
     * change, locale/theme change). UI may key icon loading on it to pick up new icons.
     */
    val iconsVersion: StateFlow<Int> = _iconsVersion.asStateFlow()

    @Volatile
    private var activityInfos: Map<String, LauncherActivityInfo> = emptyMap()

    @Volatile
    private var lastLocale: Locale = currentLocale()

    @Volatile
    private var lastUiMode: Int = currentNightMode()

    private val refreshRequests = Channel<Unit>(Channel.CONFLATED)

    @OptIn(ExperimentalCoroutinesApi::class)
    private val iconDispatcher = Dispatchers.IO.limitedParallelism(ICON_PARALLELISM)

    /** Packages changed since the last reload: their icons are dropped again once the new
     *  LauncherActivityInfo objects are in (an early re-render may have used the old ones). */
    private val pendingIconPackages: MutableSet<String> = ConcurrentHashMap.newKeySet()

    private val iconCache = object : LruCache<String, ImageBitmap>(iconCacheBytes()) {
        override fun sizeOf(key: String, value: ImageBitmap): Int = value.width * value.height * 4
    }

    private val packageCallback = object : LauncherApps.Callback() {
        override fun onPackageRemoved(packageName: String?, user: UserHandle?) =
            onPackagesChanged(user, packageName?.let { arrayOf(it) })

        override fun onPackageAdded(packageName: String?, user: UserHandle?) =
            onPackagesChanged(user, packageName?.let { arrayOf(it) })

        override fun onPackageChanged(packageName: String?, user: UserHandle?) =
            onPackagesChanged(user, packageName?.let { arrayOf(it) })

        override fun onPackagesAvailable(packageNames: Array<out String>?, user: UserHandle?, replacing: Boolean) =
            onPackagesChanged(user, packageNames)

        override fun onPackagesUnavailable(packageNames: Array<out String>?, user: UserHandle?, replacing: Boolean) =
            onPackagesChanged(user, packageNames)

        @Deprecated("Deprecated in Java")
        override fun onPackagesSuspended(packageNames: Array<out String>?, user: UserHandle?) =
            onPackagesChanged(user, packageNames)

        override fun onPackagesUnsuspended(packageNames: Array<out String>?, user: UserHandle?) =
            onPackagesChanged(user, packageNames)
    }

    private val componentCallbacks = object : ComponentCallbacks2 {
        override fun onConfigurationChanged(newConfig: Configuration) {
            val locale = newConfig.locales.takeIf { !it.isEmpty }?.get(0) ?: Locale.getDefault()
            val nightMode = newConfig.uiMode and Configuration.UI_MODE_NIGHT_MASK
            if (locale != lastLocale || nightMode != lastUiMode) {
                lastLocale = locale
                lastUiMode = nightMode
                // Labels and (themed / dark) icons may depend on the configuration.
                clearIcons()
                refresh()
            }
        }

        @Deprecated("Deprecated in Java")
        override fun onLowMemory() = iconCache.evictAll()

        @Suppress("DEPRECATION")
        override fun onTrimMemory(level: Int) {
            when {
                level >= ComponentCallbacks2.TRIM_MEMORY_COMPLETE -> iconCache.evictAll()
                level >= ComponentCallbacks2.TRIM_MEMORY_MODERATE ||
                    level == ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL ->
                    iconCache.trimToSize(iconCache.maxSize() / 2)
            }
        }
    }

    init {
        scope.launch {
            for (request in refreshRequests) reload()
        }
        try {
            launcherApps?.registerCallback(packageCallback, mainHandler)
        } catch (e: Exception) {
            Log.w(TAG, "Unable to register LauncherApps callback", e)
        }
        appContext.registerComponentCallbacks(componentCallbacks)
        refresh()
    }

    /** Re-reads the app list asynchronously. Calls are conflated; cheap to call often. */
    fun refresh() {
        refreshRequests.trySend(Unit)
    }

    /**
     * Returns the icon of [key] rendered as a [sizePx]×[sizePx] bitmap (adaptive icons get the
     * device mask), or `null` if the app is gone. Runs on [Dispatchers.IO]; results are cached.
     */
    suspend fun loadIcon(key: String, sizePx: Int): ImageBitmap? {
        if (sizePx <= 0 || sizePx > MAX_ICON_PX) return null
        val cacheKey = iconCacheKey(key, sizePx)
        iconCache.get(cacheKey)?.let { return it }
        // Bounded parallelism: superseded requests (e.g. while the icon-size slider is dragged)
        // wait in the queue and are dropped by the cancellable dispatch instead of all rendering.
        return withContext(iconDispatcher) {
            iconCache.get(cacheKey) ?: run {
                ensureActive()
                renderIcon(key, sizePx)?.also { if (isActive) iconCache.put(cacheKey, it) }
            }
        }
    }

    /** Starts the app's main activity in a new task. Shows a toast if that is impossible. */
    fun launch(key: String, sourceBounds: Rect? = null) {
        val component = ComponentName.unflattenFromString(key)
        if (component == null) {
            toast(R.string.error_open_app)
            return
        }
        val la = launcherApps
        if (la != null) {
            try {
                la.startMainActivity(component, user, sourceBounds, null)
                return
            } catch (e: Exception) {
                Log.w(TAG, "startMainActivity failed for $key", e)
            }
        }
        try {
            val intent = Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .setComponent(component)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
            intent.sourceBounds = sourceBounds
            appContext.startActivity(intent)
        } catch (e: Exception) {
            Log.w(TAG, "Unable to launch $key", e)
            toast(R.string.error_open_app)
            refresh()
        }
    }

    /** Opens the system "App info" screen of the app. */
    fun openAppInfo(key: String) {
        val component = ComponentName.unflattenFromString(key)
        if (component == null) {
            toast(R.string.error_open_app_info)
            return
        }
        val la = launcherApps
        if (la != null) {
            try {
                la.startAppDetailsActivity(component, user, null, null)
                return
            } catch (e: Exception) {
                Log.w(TAG, "startAppDetailsActivity failed for $key", e)
            }
        }
        try {
            val intent = Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", component.packageName, null),
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            appContext.startActivity(intent)
        } catch (e: Exception) {
            Log.w(TAG, "Unable to open app info for $key", e)
            toast(R.string.error_open_app_info)
        }
    }

    /** Asks the system to uninstall the app's package (system confirmation dialog). */
    fun uninstall(key: String) {
        val component = ComponentName.unflattenFromString(key)
        if (component == null) {
            toast(R.string.error_uninstall)
            return
        }
        if (!canUninstall(key)) {
            toast(R.string.error_uninstall_system)
            return
        }
        try {
            // ACTION_DELETE shows the system uninstall confirmation (needs REQUEST_DELETE_PACKAGES).
            val intent = Intent(Intent.ACTION_DELETE, Uri.fromParts("package", component.packageName, null))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            appContext.startActivity(intent)
        } catch (e: Exception) {
            Log.w(TAG, "Unable to uninstall $key", e)
            toast(R.string.error_uninstall)
        }
    }

    /**
     * `false` for pre-installed system apps that cannot be removed (updated system apps can
     * have their updates removed, so they count as uninstallable). Unknown apps → `true`.
     */
    fun canUninstall(key: String): Boolean {
        val info = activityInfo(key) ?: return true
        val flags = try {
            info.applicationInfo.flags
        } catch (e: Exception) {
            return true
        }
        val system = flags and ApplicationInfo.FLAG_SYSTEM != 0
        val updated = flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP != 0
        return !system || updated
    }

    // ------------------------------------------------------------------ internals

    private fun reload() {
        val la = launcherApps ?: return
        val infos = try {
            la.getActivityList(null, user)
        } catch (e: Exception) {
            Log.w(TAG, "getActivityList failed", e)
            return
        }
        val locale = currentLocale()
        val map = LinkedHashMap<String, LauncherActivityInfo>(infos.size)
        val list = ArrayList<AppInfo>(infos.size)
        for (info in infos) {
            val component = info.componentName ?: continue
            if (component.packageName == selfPackage) continue
            val key = component.flattenToString()
            if (map.containsKey(key)) continue
            map[key] = info
            val rawLabel = try {
                info.label
            } catch (e: Exception) {
                null
            }
            list += AppInfo(
                key = key,
                packageName = component.packageName,
                className = component.className,
                label = cleanLabel(rawLabel, component.packageName),
            )
        }
        val collator = Collator.getInstance(locale).apply { strength = Collator.SECONDARY }
        list.sortWith { a, b ->
            val byLabel = collator.compare(a.label, b.label)
            if (byLabel != 0) byLabel else a.key.compareTo(b.key)
        }
        activityInfos = map
        if (pendingIconPackages.isNotEmpty()) {
            val changed = pendingIconPackages.toList()
            pendingIconPackages.removeAll(changed.toSet())
            for (pkg in changed) invalidateIcons(pkg)
            _iconsVersion.update { it + 1 }
        }
        if (list != _apps.value) {
            _apps.value = list
            writeCache(list)
        }
    }

    private fun onPackagesChanged(changedUser: UserHandle?, packages: Array<out String>?) {
        if (changedUser != null && changedUser != user) return
        if (!packages.isNullOrEmpty()) {
            for (pkg in packages) {
                invalidateIcons(pkg)
                pendingIconPackages += pkg
            }
            // Always: tiles and the UI icon memory may hold icons this LRU already dropped
            // (trimmed while in the background), so "nothing removed here" proves nothing.
            _iconsVersion.update { it + 1 }
        }
        refresh()
    }

    private fun invalidateIcons(packageName: String) {
        val prefix = "$packageName/"
        for (cacheKey in iconCache.snapshot().keys) {
            if (cacheKey.startsWith(prefix)) iconCache.remove(cacheKey)
        }
    }

    private fun clearIcons() {
        iconCache.evictAll()
        _iconsVersion.update { it + 1 }
    }

    private fun activityInfo(key: String): LauncherActivityInfo? {
        activityInfos[key]?.let { return it }
        val component = ComponentName.unflattenFromString(key) ?: return null
        return try {
            launcherApps?.resolveActivity(
                Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setComponent(component),
                user,
            )
        } catch (e: Exception) {
            null
        }
    }

    private fun renderIcon(key: String, sizePx: Int): ImageBitmap? {
        val info = activityInfo(key) ?: return null
        val drawable: Drawable = try {
            info.getIcon(iconDensityFor(sizePx))
        } catch (e: Exception) {
            Log.w(TAG, "getIcon failed for $key", e)
            null
        } ?: try {
            appContext.packageManager.defaultActivityIcon
        } catch (e: Exception) {
            null
        } ?: return null
        return try {
            val bitmap = createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            drawable.setBounds(0, 0, sizePx, sizePx)
            drawable.draw(canvas)
            bitmap.prepareToDraw()
            bitmap.asImageBitmap()
        } catch (e: Exception) {
            Log.w(TAG, "Icon render failed for $key", e)
            null
        } catch (e: OutOfMemoryError) {
            iconCache.evictAll()
            null
        }
    }

    /** Smallest density bucket whose 48dp launcher icon is at least [sizePx] pixels. */
    private fun iconDensityFor(sizePx: Int): Int {
        val needed = sizePx * DisplayMetrics.DENSITY_DEFAULT / LAUNCHER_ICON_DP
        return DENSITY_BUCKETS.firstOrNull { it >= needed } ?: DisplayMetrics.DENSITY_XXXHIGH
    }

    private fun readCachedApps(): List<AppInfo> = try {
        val raw = cachePrefs.getString(KEY_APPS, null)
        if (raw.isNullOrEmpty()) {
            emptyList()
        } else {
            val array = JSONArray(raw)
            val seen = HashSet<String>()
            buildList {
                for (i in 0 until array.length()) {
                    val entry = array.optJSONArray(i) ?: continue
                    val key = entry.optString(0)
                    val label = entry.optString(1)
                    val component = ComponentName.unflattenFromString(key) ?: continue
                    if (component.packageName == selfPackage || !seen.add(key)) continue
                    add(
                        AppInfo(
                            key = key,
                            packageName = component.packageName,
                            className = component.className,
                            label = label.ifEmpty { component.packageName },
                        ),
                    )
                }
            }
        }
    } catch (e: Exception) {
        Log.w(TAG, "Ignoring corrupt app cache", e)
        emptyList()
    }

    private fun writeCache(list: List<AppInfo>) {
        val array = JSONArray()
        for (app in list) array.put(JSONArray().put(app.key).put(app.label))
        cachePrefs.edit { putString(KEY_APPS, array.toString()) }
    }

    private fun toast(@StringRes message: Int) {
        val show = Runnable {
            try {
                Toast.makeText(appContext, message, Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Log.w(TAG, "Toast failed", e)
            }
        }
        if (Looper.myLooper() == Looper.getMainLooper()) show.run() else mainHandler.post(show)
    }

    private fun currentLocale(): Locale {
        val locales = appContext.resources.configuration.locales
        return if (locales.isEmpty) Locale.getDefault() else locales[0]
    }

    private fun currentNightMode(): Int =
        appContext.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK

    private companion object {
        const val TAG = "LumaApps"
        const val CACHE_PREFS = "luma_app_cache"
        const val KEY_APPS = "apps"
        const val LAUNCHER_ICON_DP = 48
        const val MAX_ICON_PX = 1024
        const val MAX_CACHE_BYTES = 24 * 1024 * 1024
        const val ICON_PARALLELISM = 3

        val DENSITY_BUCKETS = intArrayOf(
            DisplayMetrics.DENSITY_MEDIUM,
            DisplayMetrics.DENSITY_HIGH,
            DisplayMetrics.DENSITY_XHIGH,
            DisplayMetrics.DENSITY_XXHIGH,
            DisplayMetrics.DENSITY_XXXHIGH,
        )

        fun iconCacheKey(key: String, sizePx: Int) = "$key|$sizePx"

        fun iconCacheBytes(): Int {
            val heapShare = Runtime.getRuntime().maxMemory() / 6
            return minOf(MAX_CACHE_BYTES.toLong(), heapShare).toInt().coerceAtLeast(4 * 1024 * 1024)
        }

        fun cleanLabel(label: CharSequence?, fallback: String): String {
            val text = label?.toString()
                ?.replace(' ', ' ')
                ?.replace('\n', ' ')
                ?.trim()
            return if (text.isNullOrEmpty()) fallback else text
        }
    }
}
