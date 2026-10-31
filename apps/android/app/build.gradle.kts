plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "com.medontime.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.medontime.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 5
        versionName = "0.3.5"

        // API 基地址默认值：生产地址；模拟器联调本机后端时在 App「设置」里改，
        // 运行时以 DataStore 中保存的地址为准（见 ApiProvider / AppSettings）。
        buildConfigField("String", "DEFAULT_API_BASE_URL", "\"https://mot.ulife.vip/\"")
        vectorDrawables { useSupportLibrary = true }
    }

    // 发布签名：仅当 CI 注入 ANDROID_KEYSTORE_FILE 等环境变量时启用（keystore 由 secrets 解码到临时目录）；
    // 本地无这些变量时不配置，assembleRelease 仍产未签名包，不影响本地构建。
    signingConfigs {
        create("release") {
            val ksFile = System.getenv("ANDROID_KEYSTORE_FILE")
            if (ksFile != null) {
                storeFile = file(ksFile)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            if (System.getenv("ANDROID_KEYSTORE_FILE") != null) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.09.00")
    implementation(composeBom)
    implementation("androidx.core:core-ktx:1.13.1")
    // 逐应用语言（per-app locale）：AppCompatDelegate.setApplicationLocales，API 33+ 走系统 LocaleManager，低版本走 AppCompat 存储与配置注入
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.navigation:navigation-compose:2.7.7")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.4")

    // 网络：Retrofit + OkHttp + kotlinx.serialization（全端统一序列化口径）
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("com.jakewharton.retrofit:retrofit2-kotlinx-serialization-converter:1.0.0")

    // 本地存储与后台排程
    implementation("androidx.datastore:datastore-preferences:1.1.1")
    implementation("androidx.work:work-runtime-ktx:2.9.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
