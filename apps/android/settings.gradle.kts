// MedOnTime Android —— Gradle 设置（包名与仓库无既有约定，按任务口径 com.medontime.app）
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "MedOnTime"
include(":app")
