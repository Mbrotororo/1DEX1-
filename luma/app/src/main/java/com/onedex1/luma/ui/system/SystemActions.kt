package com.onedex1.luma.ui.system

import android.annotation.SuppressLint
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.widget.Toast
import androidx.annotation.StringRes

/** Guarded calls into the system: nothing here may ever crash the home screen. */
object SystemActions {

    private const val TAG = "LumaSystem"

    /**
     * Pulls down the notification shade. Uses the hidden `StatusBarManager.expandNotificationsPanel`
     * (EXPAND_STATUS_BAR permission) through reflection; returns false if the device refuses.
     */
    @SuppressLint("WrongConstant", "PrivateApi")
    fun expandNotifications(context: Context): Boolean = try {
        val service = context.getSystemService("statusbar")
        if (service == null) {
            false
        } else {
            val cls = Class.forName("android.app.StatusBarManager")
            cls.getMethod("expandNotificationsPanel").invoke(service)
            true
        }
    } catch (t: Throwable) {
        Log.w(TAG, "expandNotificationsPanel failed", t)
        false
    }

    /** True if Luma is the current default home app. */
    fun isDefaultHome(context: Context): Boolean {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val rm = context.getSystemService(RoleManager::class.java)
                if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME)) {
                    return rm.isRoleHeld(RoleManager.ROLE_HOME)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "RoleManager check failed", e)
        }
        return try {
            val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
            val pm = context.packageManager
            val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.resolveActivity(intent, PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_DEFAULT_ONLY.toLong()))
            } else {
                @Suppress("DEPRECATION")
                pm.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)
            }
            info?.activityInfo?.packageName == context.packageName
        } catch (e: Exception) {
            false
        }
    }

    /** The system "make Luma the home app" dialog (Android 10+), or null if unavailable. */
    fun homeRoleRequestIntent(context: Context): Intent? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
        return try {
            val rm = context.getSystemService(RoleManager::class.java) ?: return null
            if (!rm.isRoleAvailable(RoleManager.ROLE_HOME) || rm.isRoleHeld(RoleManager.ROLE_HOME)) {
                null
            } else {
                rm.createRequestRoleIntent(RoleManager.ROLE_HOME)
            }
        } catch (e: Exception) {
            Log.w(TAG, "createRequestRoleIntent failed", e)
            null
        }
    }

    /** Opens the system screen where the default home app is chosen. */
    fun openHomeSettings(context: Context): Boolean {
        val candidates = listOf(
            Intent(Settings.ACTION_HOME_SETTINGS),
            Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS),
            Intent(Settings.ACTION_SETTINGS),
        )
        for (intent in candidates) {
            try {
                context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return true
            } catch (e: Exception) {
                Log.w(TAG, "Unable to open ${intent.action}", e)
            }
        }
        toast(context, com.onedex1.luma.R.string.error_open_settings)
        return false
    }

    fun toast(context: Context, @StringRes message: Int) {
        try {
            Toast.makeText(context.applicationContext, message, Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Log.w(TAG, "Toast failed", e)
        }
    }
}
