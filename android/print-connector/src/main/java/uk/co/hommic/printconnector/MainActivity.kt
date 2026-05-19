package uk.co.hommic.printconnector

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import uk.co.hommic.printconnector.service.ConnectorForegroundService
import uk.co.hommic.printconnector.ui.ConnectorScreen
import uk.co.hommic.printconnector.ui.ConnectorViewModel
import uk.co.hommic.printconnector.ui.ConnectorViewModelFactory

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        runCatching {
            ContextCompat.startForegroundService(this, Intent(this, ConnectorForegroundService::class.java))
        }.onFailure { error ->
            Log.e("HommicConnector", "Foreground service start failed", error)
        }

        setContent {
            val launcher = rememberLauncherForActivityResult(
                contract = ActivityResultContracts.RequestMultiplePermissions(),
                onResult = {}
            )
            val permissions = buildList {
                if (Build.VERSION.SDK_INT >= 31) {
                    add(Manifest.permission.BLUETOOTH_CONNECT)
                    add(Manifest.permission.BLUETOOTH_SCAN)
                }
                if (Build.VERSION.SDK_INT >= 33) {
                    add(Manifest.permission.POST_NOTIFICATIONS)
                }
            }

            LaunchedEffect(Unit) {
                if (permissions.isNotEmpty()) {
                    launcher.launch(permissions.toTypedArray())
                }
            }

            val viewModel: ConnectorViewModel = viewModel(factory = ConnectorViewModelFactory(applicationContext))
            val state by viewModel.state.collectAsState()
            ConnectorScreen(
                state = state,
                onPair = viewModel::pair,
                onRescan = viewModel::rescan,
                onResyncNow = viewModel::resyncNow,
                onToggleRunning = viewModel::toggleRuntime,
                onUnpair = viewModel::unpair,
                onSelectPrinter = viewModel::selectPrinter,
                onHidePrinter = viewModel::hidePrinter,
                onDeletePrinter = viewModel::deletePrinter,
                onSaveLanPrinter = viewModel::saveLanPrinter,
            )
        }
    }
}
