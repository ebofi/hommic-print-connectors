package uk.co.hommic.printconnector.data

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import uk.co.hommic.printconnector.BuildConfig
import uk.co.hommic.printconnector.model.LanPrinterDraft

private val Context.connectorDataStore by preferencesDataStore(name = "hommic_print_connector")

data class ConnectorSettings(
    val apiBaseUrl: String = BuildConfig.DEFAULT_API_BASE_URL,
    val merchantSaasUrl: String = BuildConfig.DEFAULT_SAAS_URL,
    val agentName: String = "Android Printer",
    val accessToken: String = "",
    val pairedAgentId: String = "",
    val queuePollIntervalSeconds: Int = 3,
    val heartbeatIntervalSeconds: Int = 15,
    val selectedPrinterTempId: String = "",
    val lanPrinters: List<LanPrinterDraft> = emptyList(),
    val hiddenPrinterTempIds: List<String> = emptyList(),
)

class ConnectorSettingsStore(private val context: Context) {
    private val json = Json { ignoreUnknownKeys = true }

    private object Keys {
        val API_BASE_URL = stringPreferencesKey("api_base_url")
        val SAAS_URL = stringPreferencesKey("saas_url")
        val AGENT_NAME = stringPreferencesKey("agent_name")
        val ACCESS_TOKEN = stringPreferencesKey("access_token")
        val PAIRED_AGENT_ID = stringPreferencesKey("paired_agent_id")
        val QUEUE_POLL = intPreferencesKey("queue_poll_interval")
        val HEARTBEAT = intPreferencesKey("heartbeat_interval")
        val SELECTED_PRINTER = stringPreferencesKey("selected_printer_temp_id")
        val LAN_PRINTERS = stringPreferencesKey("lan_printers")
        val HIDDEN_PRINTERS = stringPreferencesKey("hidden_printer_temp_ids")
    }

    val settings: Flow<ConnectorSettings> = context.connectorDataStore.data.map { prefs ->
        ConnectorSettings(
            apiBaseUrl = prefs[Keys.API_BASE_URL] ?: BuildConfig.DEFAULT_API_BASE_URL,
            merchantSaasUrl = prefs[Keys.SAAS_URL] ?: BuildConfig.DEFAULT_SAAS_URL,
            agentName = prefs[Keys.AGENT_NAME] ?: "Android Printer",
            accessToken = prefs[Keys.ACCESS_TOKEN] ?: "",
            pairedAgentId = prefs[Keys.PAIRED_AGENT_ID] ?: "",
            queuePollIntervalSeconds = prefs[Keys.QUEUE_POLL] ?: 3,
            heartbeatIntervalSeconds = prefs[Keys.HEARTBEAT] ?: 15,
            selectedPrinterTempId = prefs[Keys.SELECTED_PRINTER] ?: "",
            lanPrinters = decodeLanPrinters(prefs[Keys.LAN_PRINTERS]),
            hiddenPrinterTempIds = decodeStringList(prefs[Keys.HIDDEN_PRINTERS]),
        )
    }

    suspend fun update(transform: (ConnectorSettings) -> ConnectorSettings) {
        val current = settingsSnapshot()
        save(transform(current))
    }

    suspend fun save(settings: ConnectorSettings) {
        context.connectorDataStore.edit { prefs ->
            prefs[Keys.API_BASE_URL] = settings.apiBaseUrl
            prefs[Keys.SAAS_URL] = settings.merchantSaasUrl
            prefs[Keys.AGENT_NAME] = settings.agentName
            prefs[Keys.ACCESS_TOKEN] = settings.accessToken
            prefs[Keys.PAIRED_AGENT_ID] = settings.pairedAgentId
            prefs[Keys.QUEUE_POLL] = settings.queuePollIntervalSeconds
            prefs[Keys.HEARTBEAT] = settings.heartbeatIntervalSeconds
            prefs[Keys.SELECTED_PRINTER] = settings.selectedPrinterTempId
            prefs[Keys.LAN_PRINTERS] = json.encodeToString(settings.lanPrinters)
            prefs[Keys.HIDDEN_PRINTERS] = json.encodeToString(settings.hiddenPrinterTempIds)
        }
    }

    suspend fun settingsSnapshot(): ConnectorSettings {
        return settings.first()
    }

    private fun decodeLanPrinters(raw: String?): List<LanPrinterDraft> {
        if (raw.isNullOrBlank()) {
            return emptyList()
        }
        return runCatching {
            json.decodeFromString<List<LanPrinterDraft>>(raw)
        }.getOrDefault(emptyList())
    }

    private fun decodeStringList(raw: String?): List<String> {
        if (raw.isNullOrBlank()) {
            return emptyList()
        }
        return runCatching {
            json.decodeFromString<List<String>>(raw)
        }.getOrDefault(emptyList())
    }
}
