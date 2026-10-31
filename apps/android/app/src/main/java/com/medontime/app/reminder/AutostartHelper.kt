package com.medontime.app.reminder

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings

/**
 * 国产 ROM 自启动设置跳转（2026-10-31）：小米/华为/OPPO/vivo/三星的自启动管理
 * 没有统一入口，逐个厂商组件试开，全部失败则兜底到系统应用详情页，
 * 用户可在那里手动找「自启动/后台运行」开关。打不开不抛异常、不阻断设置页。
 */
object AutostartHelper {

    private val VENDOR_PAGES = listOf(
        // 小米 MIUI
        "com.miui.securitycenter" to "com.miui.permcenter.autostart.AutoStartManagementActivity",
        // 华为 EMUI / HarmonyOS
        "com.huawei.systemmanager" to "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
        "com.huawei.systemmanager" to "com.huawei.systemmanager.appcontrol.activity.StartupAppControlActivity",
        // OPPO / 一加 ColorOS
        "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
        "com.oppo.safe" to "com.oppo.safe.permission.startup.StartupAppListActivity",
        // vivo / iQOO
        "com.vivo.permissionmanager" to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
        "com.iqoo.secure" to "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity",
        // 三星 One UI（设备维护电池页）
        "com.samsung.android.lool" to "com.samsung.android.sm.ui.battery.BatteryActivity",
    )

    fun open(context: Context) {
        for ((pkg, cls) in VENDOR_PAGES) {
            val intent = Intent().apply {
                component = ComponentName(pkg, cls)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            if (runCatching { context.startActivity(intent) }.isSuccess) return
        }
        // 兜底：系统应用详情页（用户可在此管理电池/自启动相关项）。
        runCatching {
            context.startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                },
            )
        }
    }
}
