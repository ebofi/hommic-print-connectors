package uk.co.hommic.printconnector.service

import android.content.Context
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import uk.co.hommic.printconnector.data.ConnectorSettingsStore
import uk.co.hommic.printconnector.discovery.AndroidPrinterDiscoveryManager
import uk.co.hommic.printconnector.drivers.AndroidPrintRouter
import uk.co.hommic.printconnector.network.PrintAgentApi

object ConnectorContainer {
    private var initialized = false
    lateinit var settingsStore: ConnectorSettingsStore
        private set
    lateinit var runtime: ConnectorRuntime
        private set

    fun init(context: Context) {
        if (initialized) return
        val appContext = context.applicationContext
        val settings = ConnectorSettingsStore(appContext)
        val api = PrintAgentApi(
            json = Json { ignoreUnknownKeys = true },
            client = OkHttpClient.Builder()
                .addInterceptor(HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC })
                .build(),
        )
        runtime = ConnectorRuntime(
            context = appContext,
            settingsStore = settings,
            api = api,
            discoveryManager = AndroidPrinterDiscoveryManager(appContext),
            printRouter = AndroidPrintRouter(appContext),
        )
        settingsStore = settings
        initialized = true
    }
}
