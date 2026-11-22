# Luma R8 rules.
#
# The app uses no reflection-based serialization and no DI framework, so the
# default optimized Android rules plus the consumer rules shipped with
# AndroidX / Compose / coroutines cover everything. The notification shade is
# expanded via reflection on a framework class (android.app.StatusBarManager),
# which lives in the platform, not in the APK, so it needs no keep rule here.

# Keep line numbers so stack traces from the field can be de-obfuscated with
# the mapping file, but hide the original source file names.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
