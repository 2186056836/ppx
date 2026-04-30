plugins {
    id("com.android.library")
}

android {
    namespace = "com.akari.ppx.xp.modern.api101"
    compileSdk = 32

    defaultConfig {
        minSdk = 23
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    buildFeatures {
        buildConfig = false
    }
}

dependencies {
    compileOnly(Libs.libxposed_api)
}
