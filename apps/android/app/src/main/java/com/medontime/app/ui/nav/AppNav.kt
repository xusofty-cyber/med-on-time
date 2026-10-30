package com.medontime.app.ui.nav

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import com.medontime.app.R
import androidx.core.content.ContextCompat
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import com.medontime.app.core.AppContainer
import com.medontime.app.feature.adherence.AdherenceScreen
import com.medontime.app.feature.auth.LoginScreen
import com.medontime.app.feature.auth.RegisterScreen
import com.medontime.app.feature.me.AuthorizationsScreen
import com.medontime.app.feature.me.CareScreen
import com.medontime.app.feature.me.EhrScreen
import com.medontime.app.feature.me.MeHomeScreen
import com.medontime.app.feature.me.MembersScreen
import com.medontime.app.feature.me.NotificationsScreen
import com.medontime.app.feature.me.SettingsScreen
import com.medontime.app.feature.me.StockScreen
import com.medontime.app.feature.plan.DrugDetailScreen
import com.medontime.app.feature.plan.PlanEditScreen
import com.medontime.app.feature.plan.PlanListScreen
import com.medontime.app.feature.today.TodayScreen
import com.medontime.app.ui.theme.AppTheme
import com.medontime.app.ui.theme.MedOnTimeTheme

/** 路由定义（五模块：登录/今日/计划/统计/我的，见 API_CONTRACT 前端口径）。 */
object Routes {
    const val LOGIN = "auth/login"
    const val REGISTER = "auth/register"
    const val TODAY = "today"
    const val PLANS = "plans"
    const val ADHERENCE = "adherence"
    const val ME = "me"
    const val PLAN_EDIT = "plan/edit/{memberId}?planId={planId}"
    const val DRUG_DETAIL = "drug/{drugId}"
    const val ME_MEMBERS = "me/members"
    const val ME_CARE = "me/care"
    const val ME_AUTHORIZATIONS = "me/authorizations"
    const val ME_NOTIFICATIONS = "me/notifications"
    const val ME_EHR = "me/ehr"
    const val ME_STOCK = "me/stock"
    const val ME_SETTINGS = "me/settings"

    fun planEdit(memberId: String, planId: String?): String =
        if (planId == null) "plan/edit/$memberId" else "plan/edit/$memberId?planId=$planId"

    fun drugDetail(drugId: String): String = "drug/$drugId"

    val TABS = listOf(TODAY, PLANS, ADHERENCE, ME)
}

@Composable
fun AppRoot(container: AppContainer) {
    val loggedIn by container.sessionStore.isLoggedInFlow.collectAsState(initial = null)
    val careMode by container.sessionStore.careModeFlow.collectAsState(initial = false)
    val themeId by container.sessionStore.themeIdFlow.collectAsState(initial = "0")

    MedOnTimeTheme(theme = AppTheme.fromId(themeId), careMode = careMode) {
        when (loggedIn) {
            null -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            false -> AuthNav()
            true -> MainNav(container)
        }
    }
}

@Composable
private fun AuthNav() {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = Routes.LOGIN) {
        composable(Routes.LOGIN) {
            LoginScreen(onGoRegister = { navController.navigate(Routes.REGISTER) })
        }
        composable(Routes.REGISTER) {
            RegisterScreen(onBackToLogin = { navController.popBackStack() })
        }
    }
}

@Composable
private fun MainNav(container: AppContainer) {
    val navController = rememberNavController()
    val context = LocalContext.current

    // 通知权限（Android 13+）：首次进入主界面时申请一次。
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* 拒绝时本地通知不展示，站内消息仍可用，不阻塞使用 */ }
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    Scaffold(
        bottomBar = { AppBottomBar(navController) },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = Routes.TODAY,
            modifier = Modifier.padding(padding),
        ) {
            composable(
                Routes.TODAY,
                deepLinks = listOf(navDeepLink { uriPattern = "medontime://today" }),
            ) { TodayScreen() }
            composable(Routes.PLANS) {
                PlanListScreen(
                    onCreatePlan = { memberId -> navController.navigate(Routes.planEdit(memberId, null)) },
                    onEditPlan = { memberId, planId -> navController.navigate(Routes.planEdit(memberId, planId)) },
                )
            }
            composable(
                Routes.PLAN_EDIT,
                arguments = listOf(
                    navArgument("planId") {
                        type = NavType.StringType
                        nullable = true
                        defaultValue = null
                    },
                ),
            ) { entry ->
                val memberId = entry.arguments?.getString("memberId") ?: ""
                val planId = entry.arguments?.getString("planId")
                PlanEditScreen(
                    memberId = memberId,
                    planId = planId,
                    onSaved = { navController.popBackStack() },
                    onOpenDrug = { drugId -> navController.navigate(Routes.drugDetail(drugId)) },
                )
            }
            composable(
                Routes.DRUG_DETAIL,
                arguments = listOf(navArgument("drugId") { type = NavType.StringType }),
            ) { entry ->
                DrugDetailScreen(drugId = entry.arguments?.getString("drugId") ?: "")
            }
            composable(Routes.ADHERENCE) { AdherenceScreen() }
            composable(Routes.ME) {
                MeHomeScreen(
                    onMembers = { navController.navigate(Routes.ME_MEMBERS) },
                    onCare = { navController.navigate(Routes.ME_CARE) },
                    onAuthorizations = { navController.navigate(Routes.ME_AUTHORIZATIONS) },
                    onNotifications = { navController.navigate(Routes.ME_NOTIFICATIONS) },
                    onEhr = { navController.navigate(Routes.ME_EHR) },
                    onStock = { navController.navigate(Routes.ME_STOCK) },
                    onSettings = { navController.navigate(Routes.ME_SETTINGS) },
                )
            }
            composable(Routes.ME_MEMBERS) { MembersScreen() }
            composable(Routes.ME_CARE) { CareScreen() }
            composable(Routes.ME_AUTHORIZATIONS) { AuthorizationsScreen() }
            composable(Routes.ME_NOTIFICATIONS) { NotificationsScreen() }
            composable(Routes.ME_EHR) { EhrScreen() }
            composable(Routes.ME_STOCK) { StockScreen() }
            composable(Routes.ME_SETTINGS) { SettingsScreen() }
        }
    }
}

@Composable
private fun AppBottomBar(navController: NavHostController) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    if (Routes.TABS.none { it == currentRoute }) return
    NavigationBar {
        NavigationBarItem(
            selected = currentRoute == Routes.TODAY,
            onClick = { navigateTab(navController, Routes.TODAY) },
            icon = { Icon(Icons.Filled.Home, contentDescription = stringResource(R.string.nav_today)) },
            label = { Text(stringResource(R.string.nav_today)) },
        )
        NavigationBarItem(
            selected = currentRoute == Routes.PLANS,
            onClick = { navigateTab(navController, Routes.PLANS) },
            icon = { Icon(Icons.Filled.List, contentDescription = stringResource(R.string.nav_plans)) },
            label = { Text(stringResource(R.string.nav_plans)) },
        )
        NavigationBarItem(
            selected = currentRoute == Routes.ADHERENCE,
            onClick = { navigateTab(navController, Routes.ADHERENCE) },
            icon = { Icon(Icons.Filled.DateRange, contentDescription = stringResource(R.string.nav_stats)) },
            label = { Text(stringResource(R.string.nav_stats)) },
        )
        NavigationBarItem(
            selected = currentRoute == Routes.ME,
            onClick = { navigateTab(navController, Routes.ME) },
            icon = { Icon(Icons.Filled.Person, contentDescription = stringResource(R.string.nav_me)) },
            label = { Text(stringResource(R.string.nav_me)) },
        )
    }
}

private fun navigateTab(navController: NavHostController, route: String) {
    navController.navigate(route) {
        popUpTo(navController.graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
