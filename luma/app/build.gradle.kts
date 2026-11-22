import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.roborazzi)
}

// ---------------------------------------------------------------------------
// Release signing: LUMA_STORE_FILE / LUMA_STORE_PASSWORD / LUMA_KEY_ALIAS /
// LUMA_KEY_PASSWORD are read from local.properties, then Gradle properties,
// then environment variables. If anything is missing the release build falls
// back to the debug signing config so `assembleRelease` always works.
// ---------------------------------------------------------------------------
val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.isFile) file.inputStream().use { load(it) }
}

fun signingValue(key: String): String? =
    (localProperties.getProperty(key)
        ?: providers.gradleProperty(key).orNull
        ?: providers.environmentVariable(key).orNull)
        ?.trim()
        ?.takeIf { it.isNotEmpty() }

val releaseStoreFile: File? = signingValue("LUMA_STORE_FILE")
    ?.let { rootProject.file(it) }
    ?.takeIf { it.isFile }
val releaseStorePassword = signingValue("LUMA_STORE_PASSWORD")
val releaseKeyAlias = signingValue("LUMA_KEY_ALIAS")
val releaseKeyPassword = signingValue("LUMA_KEY_PASSWORD")
val hasReleaseSigning = releaseStoreFile != null &&
    releaseStorePassword != null && releaseKeyAlias != null && releaseKeyPassword != null

if (!hasReleaseSigning) {
    logger.warn("Luma: release signing keys not found - release APK will be signed with the debug key.")
}

android {
    namespace = "com.onedex1.luma"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.onedex1.luma"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = releaseStoreFile
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
                enableV1Signing = true
                enableV2Signing = true
                enableV3Signing = true
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            signingConfig = if (hasReleaseSigning) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    androidResources {
        // The UI is Russian (default resources); keep English for library strings only.
        localeFilters += listOf("ru", "en")
    }

    packaging {
        resources {
            excludes += setOf(
                "/META-INF/{AL2.0,LGPL2.1}",
                "/META-INF/*.version",
                "/META-INF/*.kotlin_module",
                "DebugProbesKt.bin",
                "kotlin-tooling-metadata.json",
            )
        }
    }

    testOptions {
        unitTests {
            // JVM screenshot tests (Robolectric native graphics + Roborazzi) need the real resources.
            isIncludeAndroidResources = true
            all { test ->
                // Render through Robolectric's HardwareRenderer so the AGSL RuntimeShader path (API 33+)
                // is exercised exactly like on a device; the glass falls back to the plain path otherwise.
                test.systemProperty("robolectric.pixelCopyRenderMode", "hardware")
                test.maxHeapSize = "3g"
            }
        }
    }

    dependenciesInfo {
        // Not distributed through Google Play; keep the APK free of the signing-block blob.
        includeInApk = false
        includeInBundle = false
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.animation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui.tooling.preview)
    debugImplementation(libs.androidx.compose.ui.tooling)

    // JVM screenshot tests: ./gradlew :app:recordRoborazziDebug
    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(platform(libs.androidx.compose.bom))
    testImplementation(libs.androidx.compose.ui.test.junit4)
    testImplementation(libs.roborazzi)
}
