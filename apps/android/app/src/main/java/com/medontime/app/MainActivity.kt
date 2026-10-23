package com.medontime.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.CompositionLocalProvider
import com.medontime.app.core.LocalAppContainer
import com.medontime.app.ui.nav.AppRoot

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as MedOnTimeApp
        setContent {
            CompositionLocalProvider(LocalAppContainer provides app.container) {
                AppRoot(app.container)
            }
        }
    }
}
