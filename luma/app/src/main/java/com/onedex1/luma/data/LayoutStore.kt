package com.onedex1.luma.data

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.os.Build
import android.provider.AlarmClock
import android.provider.MediaStore
import android.provider.Telephony
import android.telecom.TelecomManager
import android.util.Log
import androidx.core.content.edit
import androidx.core.net.toUri
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import java.io.File
import java.text.Collator

/**
 * Which apps sit on the home grid and in the dock (both ordered lists of [AppInfo.key]).
 *
 * An app lives in at most one place: adding it to the dock takes it off the home grid and
 * adding it to the home grid takes it out of the dock. Every change is persisted to
 * SharedPreferences immediately. All methods are thread-safe.
 */
class LayoutStore(context: Context) {

    private val appContext: Context = context.applicationContext
    private val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val lock = Any()

    private val _home = MutableStateFlow(readKeys(KEY_HOME))
    private val _dock = MutableStateFlow(readKeys(KEY_DOCK).filter { it !in _home.value }.take(MAX_DOCK))

    /** App keys on the home grid, in display order. */
    val home: StateFlow<List<String>> = _home.asStateFlow()

    /** App keys in the dock, at most [MAX_DOCK]. */
    val dock: StateFlow<List<String>> = _dock.asStateFlow()

    /**
     * First run only: fills the dock with the default phone, messages, browser and camera apps
     * and the home grid with popular apps (then alphabetically). Does nothing while [apps] is
     * still empty, so it is safe to call on every emission of [AppRepository.apps].
     */
    fun ensureDefaults(apps: List<AppInfo>) {
        if (apps.isEmpty()) return
        synchronized(lock) {
            if (prefs.getBoolean(KEY_INITIALIZED, false)) return
            val byPackage = LinkedHashMap<String, MutableList<AppInfo>>()
            for (app in apps) byPackage.getOrPut(app.packageName) { ArrayList(1) } += app

            val dock = defaultDock(apps, byPackage)
            val home = defaultHome(apps, byPackage, dock.toHashSet())
            commit(home = home, dock = dock, markInitialized = true)
        }
    }

    fun addToHome(key: String) {
        synchronized(lock) {
            if (key in _home.value) return
            commit(home = _home.value + key, dock = _dock.value - key)
        }
    }

    fun removeFromHome(key: String) {
        synchronized(lock) {
            if (key !in _home.value) return
            commit(home = _home.value - key)
        }
    }

    /** Adds [key] to the end of the dock. Returns `false` if the dock is already full. */
    fun addToDock(key: String): Boolean {
        synchronized(lock) {
            if (key in _dock.value) return true
            var dock = _dock.value
            if (dock.size >= MAX_DOCK) {
                // A slot held by an app that is kept but not launchable right now (see prune)
                // is invisible in the dock: let the visible app take it instead of "dock full".
                val installed = lastInstalled
                if (installed.isEmpty()) return false
                val hidden = dock.lastOrNull { it !in installed } ?: return false
                dock = dock - hidden
            }
            commit(home = _home.value - key, dock = dock + key)
            return true
        }
    }

    fun removeFromDock(key: String) {
        synchronized(lock) {
            if (key !in _dock.value) return
            commit(dock = _dock.value - key)
        }
    }

    /** Moves a home-grid item; out-of-range indices are ignored. */
    fun move(fromIndex: Int, toIndex: Int) {
        synchronized(lock) {
            val list = _home.value.toMutableList()
            if (fromIndex !in list.indices || toIndex !in list.indices || fromIndex == toIndex) return
            list.add(toIndex, list.removeAt(fromIndex))
            commit(home = list)
        }
    }

    /**
     * Reconciles the layout with the launchable apps in [installedKeys]. An empty set is ignored on
     * purpose: it means "app list not loaded yet", not "everything was uninstalled".
     *
     * An entry whose exact component is gone is handled by package, never dropped blindly:
     *  - same package, other launcher activity (activity-alias icon switch, e.g. Telegram's app
     *    icon setting, or a renamed activity after an update) -> replaced in place;
     *  - package still on the device but not launchable right now (adopted SD card not mounted yet,
     *    disabled), being installed / restored, or inside the restore window -> kept (the UI hides
     *    keys without an app, so nothing broken is shown);
     *  - package really gone -> dropped.
     * If a mass disappearance empties both home and dock, the first-run defaults are rebuilt.
     */
    fun prune(installedKeys: Set<String>) {
        if (installedKeys.isEmpty()) return
        lastInstalled = installedKeys

        val byPackage = HashMap<String, MutableList<String>>()
        for (k in installedKeys.sorted()) {
            val pkg = ComponentName.unflattenFromString(k)?.packageName ?: continue
            byPackage.getOrPut(pkg) { ArrayList(1) } += k
        }

        // Package lookups (binder calls) happen outside the lock, on a snapshot.
        val known = HashMap<String, Boolean>()
        fun isKnown(pkg: String): Boolean = known.getOrPut(pkg) { isPackageKnown(pkg) }
        for (key in _home.value + _dock.value) {
            if (key in installedKeys) continue
            val pkg = ComponentName.unflattenFromString(key)?.packageName ?: continue
            if (pkg !in byPackage) isKnown(pkg)
        }

        synchronized(lock) {
            val oldHome = _home.value
            val oldDock = _dock.value
            // Keys that stay valid where they are, so a replacement never duplicates one.
            val used = HashSet<String>()
            oldHome.filterTo(used) { it in installedKeys }
            oldDock.filterTo(used) { it in installedKeys }

            fun remap(list: List<String>): List<String> = list.mapNotNull { key ->
                if (key in installedKeys) return@mapNotNull key
                val pkg = ComponentName.unflattenFromString(key)?.packageName ?: return@mapNotNull null
                val candidates = byPackage[pkg]
                when {
                    candidates != null -> candidates.firstOrNull { it !in used }?.also { used += it }
                    isKnown(pkg) -> key
                    else -> null
                }
            }

            val dock = remap(oldDock)
            val home = remap(oldHome)
            if (home == oldHome && dock == oldDock) return
            val dropped = oldHome.size + oldDock.size - home.size - dock.size
            val wipedOut = home.isEmpty() && dock.isEmpty() && dropped >= 2
            commit(home = home, dock = dock, clearInitialized = wipedOut)
        }
    }

    /**
     * True if [pkg] is still on the device in some form (installed but unavailable, disabled,
     * being installed / restored), or if we are shortly after a backup restore where apps are
     * still being reinstalled from the store.
     */
    private fun isPackageKnown(pkg: String): Boolean {
        val pm = appContext.packageManager
        val installed = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.getApplicationInfo(
                    pkg,
                    PackageManager.ApplicationInfoFlags.of(PackageManager.MATCH_UNINSTALLED_PACKAGES.toLong()),
                )
            } else {
                @Suppress("DEPRECATION")
                pm.getApplicationInfo(pkg, PackageManager.MATCH_UNINSTALLED_PACKAGES)
            }
            true
        } catch (e: Exception) {
            false
        }
        if (installed) return true
        val installing = try {
            pm.packageInstaller.allSessions.any { it.appPackageName == pkg }
        } catch (e: Exception) {
            false
        }
        return installing || inRestoreWindow()
    }

    /** Last full set of launchable keys seen by [prune] (empty until the first app list). */
    @Volatile
    private var lastInstalled: Set<String> = emptySet()

    /**
     * Restore detection. luma_layout.xml is part of the backup, the marker file in
     * noBackupFilesDir is not: layout data present but no marker means the layout was restored
     * onto a new install, and for [RESTORE_WINDOW_MS] apps that are not installed yet are kept.
     * Evaluated eagerly (before the first ensureDefaults can mark a fresh install initialized).
     */
    private val restoredAt: Long = run {
        try {
            val marker = File(appContext.noBackupFilesDir, MARKER_FILE)
            if (marker.isFile) {
                marker.readText().trim().toLongOrNull() ?: 0L
            } else {
                val restored = prefs.getBoolean(KEY_INITIALIZED, false)
                val stamp = if (restored) System.currentTimeMillis() else 0L
                marker.writeText(stamp.toString())
                stamp
            }
        } catch (e: Exception) {
            0L
        }
    }

    private fun inRestoreWindow(): Boolean {
        val at = restoredAt
        if (at <= 0L) return false
        val age = System.currentTimeMillis() - at
        return age in 0 until RESTORE_WINDOW_MS
    }

    // ------------------------------------------------------------------ persistence

    private fun commit(
        home: List<String> = _home.value,
        dock: List<String> = _dock.value,
        markInitialized: Boolean = false,
        clearInitialized: Boolean = false,
    ) {
        val cleanDock = dock.distinct().take(MAX_DOCK)
        val cleanHome = home.distinct().filter { it !in cleanDock }
        _home.value = cleanHome
        _dock.value = cleanDock
        prefs.edit {
            putString(KEY_HOME, JSONArray(cleanHome).toString())
            putString(KEY_DOCK, JSONArray(cleanDock).toString())
            if (markInitialized) putBoolean(KEY_INITIALIZED, true)
            if (clearInitialized) putBoolean(KEY_INITIALIZED, false)
        }
    }

    private fun readKeys(prefKey: String): List<String> = try {
        val raw = prefs.getString(prefKey, null)
        if (raw.isNullOrEmpty()) {
            emptyList()
        } else {
            val array = JSONArray(raw)
            (0 until array.length())
                .map { array.optString(it) }
                .filter { ComponentName.unflattenFromString(it) != null }
                .distinct()
        }
    } catch (e: Exception) {
        Log.w(TAG, "Ignoring corrupt layout entry $prefKey", e)
        emptyList()
    }

    // ------------------------------------------------------------------ defaults

    private fun defaultDock(apps: List<AppInfo>, byPackage: Map<String, List<AppInfo>>): List<String> {
        val slots: List<() -> String?> = listOf(
            { defaultDialerPackage() ?: resolvePackage(Intent(Intent.ACTION_DIAL), byPackage) },
            { defaultSmsPackage() ?: resolvePackage(Intent(Intent.ACTION_SENDTO, "smsto:".toUri()), byPackage) },
            {
                resolvePackage(
                    Intent(Intent.ACTION_VIEW, "https://example.com".toUri())
                        .addCategory(Intent.CATEGORY_BROWSABLE),
                    byPackage,
                ) ?: resolvePackage(selector(Intent.CATEGORY_APP_BROWSER), byPackage)
            },
            {
                resolvePackage(Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA), byPackage)
                    ?: resolvePackage(Intent(MediaStore.ACTION_IMAGE_CAPTURE), byPackage)
            },
        )
        val dock = ArrayList<String>(MAX_DOCK)
        for (slot in slots) {
            val pkg = try {
                slot()
            } catch (e: Exception) {
                null
            }
            val key = pkg?.let { byPackage[it]?.firstOrNull()?.key }
            if (key != null && key !in dock) dock += key
        }
        // Fallback: fill any slot we could not resolve with the first apps of the list.
        for (app in apps) {
            if (dock.size >= MAX_DOCK) break
            if (app.key !in dock) dock += app.key
        }
        return dock
    }

    private fun defaultHome(
        apps: List<AppInfo>,
        byPackage: Map<String, List<AppInfo>>,
        inDock: Set<String>,
    ): List<String> {
        val home = LinkedHashSet<String>()
        for (group in POPULAR) {
            if (home.size >= MAX_POPULAR) break
            val key = group.packages.firstNotNullOfOrNull { byPackage[it]?.firstOrNull()?.key }
                ?: group.intent?.let { make ->
                    try {
                        resolvePackage(make(), byPackage)?.let { byPackage[it]?.firstOrNull()?.key }
                    } catch (e: Exception) {
                        null
                    }
                }
            if (key != null && key !in inDock) home += key
        }
        val collator = Collator.getInstance().apply { strength = Collator.SECONDARY }
        for (app in apps.sortedWith { a, b -> collator.compare(a.label, b.label) }) {
            if (home.size >= HOME_DEFAULT_SIZE) break
            if (app.key !in inDock) home += app.key
        }
        return home.toList()
    }

    private fun defaultDialerPackage(): String? = try {
        appContext.getSystemService(TelecomManager::class.java)?.defaultDialerPackage
    } catch (e: Exception) {
        null
    }

    private fun defaultSmsPackage(): String? = try {
        Telephony.Sms.getDefaultSmsPackage(appContext)
    } catch (e: Exception) {
        null
    }

    /**
     * Package of the default handler of [intent] if it is a launchable app; otherwise the
     * first launchable candidate (pre-installed apps first), or `null`.
     */
    private fun resolvePackage(intent: Intent, byPackage: Map<String, List<AppInfo>>): String? {
        val pm = appContext.packageManager
        val default = try {
            pm.resolveActivityCompat(intent)?.activityInfo?.packageName
        } catch (e: Exception) {
            null
        }
        if (default != null && default in byPackage) return default
        val candidates = try {
            pm.queryIntentActivitiesCompat(intent)
        } catch (e: Exception) {
            emptyList()
        }
        return candidates
            .sortedByDescending { it.activityInfo?.applicationInfo?.let { ai -> ai.flags and ApplicationInfo.FLAG_SYSTEM != 0 } ?: false }
            .mapNotNull { it.activityInfo?.packageName }
            .firstOrNull { it in byPackage }
    }

    private class PopularApp(val packages: List<String>, val intent: (() -> Intent)? = null)

    companion object {
        /** Maximum number of apps in the dock. */
        const val MAX_DOCK = 4

        private const val TAG = "LumaLayout"
        private const val PREFS = "luma_layout"
        private const val KEY_HOME = "home"
        private const val KEY_DOCK = "dock"
        private const val KEY_INITIALIZED = "initialized"
        private const val MAX_POPULAR = 12
        private const val HOME_DEFAULT_SIZE = 16
        private const val MARKER_FILE = "luma_layout_marker"
        private const val RESTORE_WINDOW_MS = 3L * 24 * 60 * 60 * 1000

        private fun selector(category: String): Intent =
            Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, category)

        private fun PackageManager.resolveActivityCompat(intent: Intent): ResolveInfo? =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                resolveActivity(intent, PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_DEFAULT_ONLY.toLong()))
            } else {
                @Suppress("DEPRECATION")
                resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)
            }

        private fun PackageManager.queryIntentActivitiesCompat(intent: Intent): List<ResolveInfo> =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_DEFAULT_ONLY.toLong()))
            } else {
                @Suppress("DEPRECATION")
                queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
            }

        /** Popular apps for the first home screen, in priority order; first installed match wins. */
        private val POPULAR: List<PopularApp> = listOf(
            // Settings
            PopularApp(listOf("com.android.settings")) { Intent(android.provider.Settings.ACTION_SETTINGS) },
            // Play Store
            PopularApp(listOf("com.android.vending")),
            // Gallery / Photos
            PopularApp(
                listOf(
                    "com.google.android.apps.photos",
                    "com.sec.android.gallery3d",
                    "com.miui.gallery",
                    "com.coloros.gallery3d",
                    "com.oneplus.gallery",
                    "com.huawei.photos",
                    "com.vivo.gallery",
                    "com.android.gallery3d",
                ),
            ) { selector(Intent.CATEGORY_APP_GALLERY) },
            // YouTube
            PopularApp(listOf("com.google.android.youtube")),
            // Clock
            PopularApp(
                listOf(
                    "com.google.android.deskclock",
                    "com.sec.android.app.clockpackage",
                    "com.android.deskclock",
                    "com.coloros.alarmclock",
                    "com.oneplus.deskclock",
                ),
            ) { Intent(AlarmClock.ACTION_SHOW_ALARMS) },
            // Calendar
            PopularApp(
                listOf(
                    "com.google.android.calendar",
                    "com.samsung.android.calendar",
                    "com.xiaomi.calendar",
                    "com.android.calendar",
                ),
            ) { selector(Intent.CATEGORY_APP_CALENDAR) },
            // Maps
            PopularApp(
                listOf(
                    "com.google.android.apps.maps",
                    "ru.yandex.yandexmaps",
                    "ru.dublgis.dgismobile",
                ),
            ) { selector(Intent.CATEGORY_APP_MAPS) },
            // Mail
            PopularApp(listOf("com.google.android.gm", "ru.yandex.mail", "ru.mail.mailapp")),
            // Camera (skipped automatically when it is already in the dock)
            PopularApp(emptyList()) { Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA) },
            // Messengers / social
            PopularApp(listOf("org.telegram.messenger", "org.telegram.messenger.web", "org.thunderdog.challegram")),
            PopularApp(listOf("com.vkontakte.android")),
            PopularApp(listOf("com.zhiliaoapp.musically", "com.ss.android.ugc.trill")),
            // Minecraft — of course
            PopularApp(listOf("com.mojang.minecraftpe")),
            PopularApp(listOf("com.discord")),
            PopularApp(listOf("com.google.android.apps.youtube.creator")),
            PopularApp(listOf("tv.twitch.android.app")),
            PopularApp(listOf("com.whatsapp")),
            PopularApp(listOf("ru.yandex.music", "com.spotify.music")),
        )
    }
}
