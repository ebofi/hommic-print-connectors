package uk.co.hommic.printconnector.service

import android.content.Context
import android.os.Build
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import uk.co.hommic.printconnector.BuildConfig
import uk.co.hommic.printconnector.data.ConnectorSettings
import uk.co.hommic.printconnector.data.ConnectorSettingsStore
import uk.co.hommic.printconnector.discovery.AndroidPrinterDiscoveryManager
import uk.co.hommic.printconnector.drivers.AndroidPrintRouter
import uk.co.hommic.printconnector.model.ConnectorState
import uk.co.hommic.printconnector.model.DiscoveredPrintersRequest
import uk.co.hommic.printconnector.model.HeartbeatRequest
import uk.co.hommic.printconnector.model.JobStatusRequest
import uk.co.hommic.printconnector.model.LanPrinterDraft
import uk.co.hommic.printconnector.model.LocalPrinter
import uk.co.hommic.printconnector.model.PairVerifyRequest
import uk.co.hommic.printconnector.model.PrintJob
import uk.co.hommic.printconnector.model.PrinterStatusRequest
import uk.co.hommic.printconnector.network.PrintAgentApi
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.concurrent.atomic.AtomicBoolean

class ConnectorRuntime(
    private val context: Context,
    private val settingsStore: ConnectorSettingsStore,
    private val api: PrintAgentApi,
    private val discoveryManager: AndroidPrinterDiscoveryManager,
    private val printRouter: AndroidPrintRouter,
) {
    companion object {
        private const val REALTIME_FALLBACK_POLL_MS = 2_000L
        private const val SOCKET_RECONNECT_DELAY_MS = 3_000L
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val state = MutableStateFlow(ConnectorState(apiBaseUrl = BuildConfig.DEFAULT_API_BASE_URL, merchantSaasUrl = BuildConfig.DEFAULT_SAAS_URL))
    private val jobMutex = Mutex()
    private val running = AtomicBoolean(false)
    private var socket: WebSocket? = null
    private var heartbeatJob: Job? = null
    private var pollJob: Job? = null
    private var discoveryJob: Job? = null
    private var socketReconnectJob: Job? = null
    private val timeFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy, h:mm:ss a").withZone(ZoneId.systemDefault())

    fun state(): StateFlow<ConnectorState> = state.asStateFlow()

    fun start() {
        if (running.getAndSet(true)) return
        scope.launch {
            syncStateFromSettings()
            ensureLoops(settingsStore.settingsSnapshot())
        }
    }

    fun stop() {
        running.set(false)
        heartbeatJob?.cancel()
        pollJob?.cancel()
        discoveryJob?.cancel()
        socketReconnectJob?.cancel()
        socket?.close(1000, "stopped")
        appendLog("Connector stopped.")
        state.value = state.value.copy(running = false, online = false, statusMessage = "Stopped")
    }

    fun toggleRuntime() {
        if (running.get()) stop() else start()
    }

    fun pair(pairingCode: String, agentName: String) {
        scope.launch {
            appendLog("Starting Android pairing.")
            val settings = settingsStore.settingsSnapshot().copy(agentName = agentName)
            settingsStore.save(settings)
            syncStateFromSettings()
            try {
                val response = api.verifyPairing(
                    settings.apiBaseUrl,
                    PairVerifyRequest(
                        pairing_code = pairingCode.trim(),
                        name = agentName.trim(),
                        app_version = BuildConfig.VERSION_NAME,
                        metadata = mapOf(
                            "manufacturer" to Build.MANUFACTURER.orEmpty(),
                            "model" to Build.MODEL.orEmpty(),
                            "device" to Build.DEVICE.orEmpty(),
                            "sdk_int" to Build.VERSION.SDK_INT.toString(),
                        ),
                    ),
                )
                settingsStore.save(
                    settings.copy(
                        accessToken = response.access_token,
                        pairedAgentId = response.agent_id,
                        queuePollIntervalSeconds = response.queue_poll_interval_seconds,
                        heartbeatIntervalSeconds = response.heartbeat_interval_seconds,
                    )
                )
                syncStateFromSettings()
                appendLog("Pairing complete. Agent ${response.agent_id} is ready.")
                ensureLoops(settingsStore.settingsSnapshot())
            } catch (error: Exception) {
                appendLog("Pairing failed: ${error.message}")
                state.value = state.value.copy(statusMessage = error.message ?: "Pairing failed")
            }
        }
    }

    fun unpair() {
        scope.launch {
            val settings = settingsStore.settingsSnapshot()
            if (settings.accessToken.isNotBlank()) {
                runCatching {
                    api.unpair(settings.apiBaseUrl, settings.accessToken)
                }.onSuccess {
                    appendLog("Android connector unpaired from SaaS.")
                }.onFailure {
                    appendLog("Android connector remote unpair failed: ${it.message}")
                }
            }
            stop()
            settingsStore.save(
                settings.copy(
                    accessToken = "",
                    pairedAgentId = "",
                    selectedPrinterTempId = "",
                )
            )
            syncStateFromSettings()
            state.value = state.value.copy(
                discoveredPrinters = emptyList(),
                online = false,
                statusMessage = "Ready to pair",
            )
            appendLog("Android connector unpaired.")
        }
    }

    fun selectPrinter(tempId: String) {
        scope.launch {
            settingsStore.update { it.copy(selectedPrinterTempId = tempId) }
            syncStateFromSettings()
        }
    }

    fun saveLanPrinter(draft: LanPrinterDraft) {
        scope.launch {
            settingsStore.update { settings ->
                settings.copy(
                    lanPrinters = (settings.lanPrinters + draft).distinctBy { "${it.ipAddress}:${it.port}" }
                )
            }
            rescan()
        }
    }

    fun hidePrinter(tempId: String) {
        scope.launch {
            applyHidePrinter(tempId)
        }
    }

    fun deletePrinter(tempId: String) {
        scope.launch {
            val currentPrinter = state.value.discoveredPrinters.firstOrNull { it.tempId == tempId }
            val settings = settingsStore.settingsSnapshot()
            if (!currentPrinter?.backendPrinterId.isNullOrBlank() && settings.accessToken.isNotBlank()) {
                runCatching {
                    api.deletePrinter(settings.apiBaseUrl, settings.accessToken, currentPrinter!!.backendPrinterId!!)
                }.onFailure {
                    appendLog("SaaS delete failed for ${currentPrinter?.name}: ${it.message}")
                }
            }
            applyHidePrinter(tempId)
        }
    }

    fun rescan() {
        scope.launch {
            syncDiscoveredPrinters()
        }
    }

    fun resyncNow() {
        scope.launch {
            appendLog("Manual Android resync started.")
            syncDiscoveredPrinters()
            if (settingsStore.settingsSnapshot().accessToken.isNotBlank()) {
                runCatching { sendHeartbeat() }
                    .onFailure { appendLog("Resync heartbeat failed: ${it.message}") }
                reconnectWebSocket()
                runCatching { fetchAndProcessJobs() }
                    .onFailure { appendLog("Resync job fetch failed: ${it.message}") }
            }
        }
    }

    private suspend fun ensureLoops(settings: ConnectorSettings) {
        state.value = state.value.copy(running = true, paired = settings.accessToken.isNotBlank())
        if (settings.accessToken.isBlank()) {
            state.value = state.value.copy(statusMessage = "Waiting for pairing")
            return
        }

        if (heartbeatJob?.isActive != true) {
            heartbeatJob = scope.launch {
                while (running.get()) {
                    runCatching { sendHeartbeat() }
                        .onFailure { appendLog("Heartbeat failed: ${it.message}") }
                    delay((settingsStore.settingsSnapshot().heartbeatIntervalSeconds * 1000L).coerceAtLeast(10_000L))
                }
            }
        }

        if (pollJob?.isActive != true) {
            pollJob = scope.launch {
                while (running.get()) {
                    runCatching { fetchAndProcessJobs() }
                        .onFailure { appendLog("Job polling failed: ${it.message}") }
                    val configuredPollMs = (settingsStore.settingsSnapshot().queuePollIntervalSeconds * 1000L).coerceAtLeast(1_000L)
                    delay(REALTIME_FALLBACK_POLL_MS.coerceAtMost(configuredPollMs))
                }
            }
        }

        if (discoveryJob?.isActive != true) {
            discoveryJob = scope.launch {
                while (running.get()) {
                    runCatching { syncDiscoveredPrinters() }
                        .onFailure { appendLog("Discovery sync failed: ${it.message}") }
                    delay(30_000L)
                }
            }
        }

        connectWebSocket(settings)
    }

    private suspend fun sendHeartbeat() {
        val settings = settingsStore.settingsSnapshot()
        api.heartbeat(
            baseUrl = settings.apiBaseUrl,
            token = settings.accessToken,
            payload = HeartbeatRequest(
                app_version = BuildConfig.VERSION_NAME,
                status = "online",
                metadata = mapOf(
                    "selected_printer_temp_id" to settings.selectedPrinterTempId,
                    "selected_printer_name" to currentSelectedPrinterName(),
                    "android_sdk" to Build.VERSION.SDK_INT.toString(),
                ),
            ),
        )
        val heartbeat = formatNow()
        state.value = state.value.copy(online = true, lastHeartbeatAt = heartbeat, statusMessage = "Connected")
    }

    private suspend fun syncDiscoveredPrinters() {
        val settings = settingsStore.settingsSnapshot()
        val hidden = settings.hiddenPrinterTempIds.toSet()
        val local = discoveryManager.discover(settings).filterNot { hidden.contains(it.tempId) }
        if (settings.accessToken.isBlank()) {
            state.value = state.value.copy(discoveredPrinters = local, hiddenPrinterTempIds = settings.hiddenPrinterTempIds)
            return
        }
        val synced = api.syncDiscoveredPrinters(
            baseUrl = settings.apiBaseUrl,
            token = settings.accessToken,
            payload = DiscoveredPrintersRequest(local.map { it.toPayload() }),
        )
        val mapped = local.map { localPrinter ->
            val backend = synced.firstOrNull { backendPrinter ->
                backendPrinter.metadata["temp_id"] == localPrinter.tempId ||
                    backendPrinter.metadata["android_temp_id"] == localPrinter.tempId ||
                    backendPrinter.name == localPrinter.name
            }
            if (backend != null) {
                localPrinter.copy(backendPrinterId = backend.id)
            } else {
                localPrinter
            }
        }
        state.value = state.value.copy(discoveredPrinters = mapped, hiddenPrinterTempIds = settings.hiddenPrinterTempIds)
        appendLog("Synced ${mapped.size} Android printers to SaaS.")
    }

    private suspend fun fetchAndProcessJobs() {
        jobMutex.withLock {
            val settings = settingsStore.settingsSnapshot()
            if (settings.accessToken.isBlank()) return
            val jobs = api.fetchJobs(settings.apiBaseUrl, settings.accessToken)
            if (jobs.isEmpty()) return
            appendLog("Received ${jobs.size} pending Android print job(s).")
            jobs.forEach { job ->
                processJob(settings, job)
            }
        }
    }

    private suspend fun processJob(settings: ConnectorSettings, job: PrintJob) {
        val targetPrinter = resolveTargetPrinter(job)
            ?: throw IllegalStateException("No matching Android printer available for ${job.document_type}")
        val claimed = api.claimJob(
            baseUrl = settings.apiBaseUrl,
            token = settings.accessToken,
            jobId = job.id,
            printerDeviceId = targetPrinter.backendPrinterId,
        )
        appendLog("Claimed job ${job.id} for ${targetPrinter.name}.")
        try {
            val rawResponse = printRouter.print(claimed, targetPrinter)
            api.updateJobStatus(
                baseUrl = settings.apiBaseUrl,
                token = settings.accessToken,
                jobId = claimed.id,
                payload = JobStatusRequest("printed", raw_response = rawResponse),
            )
            targetPrinter.backendPrinterId?.let { printerId ->
                api.updatePrinterStatus(
                    baseUrl = settings.apiBaseUrl,
                    token = settings.accessToken,
                    printerId = printerId,
                    payload = PrinterStatusRequest(
                        status = "online",
                        metadata = mapOf("last_printed_job_id" to claimed.id),
                    ),
                )
            }
            appendLog("Printed job ${claimed.id} on ${targetPrinter.name}.")
        } catch (error: Exception) {
            api.updateJobStatus(
                baseUrl = settings.apiBaseUrl,
                token = settings.accessToken,
                jobId = claimed.id,
                payload = JobStatusRequest(
                    status = "failed",
                    error_message = error.message ?: "Android print failed",
                    raw_response = mapOf("exception" to (error.message ?: "unknown")),
                ),
            )
            appendLog("Print failed for job ${claimed.id}: ${error.message}")
        }
    }

    private fun resolveTargetPrinter(job: PrintJob): LocalPrinter? {
        val printers = state.value.discoveredPrinters
        return printers.firstOrNull { it.backendPrinterId == job.printer_device_id }
            ?: printers.firstOrNull { it.tempId == state.value.selectedPrinterTempId }
            ?: printers.firstOrNull()
    }

    private fun connectWebSocket(current: ConnectorSettings) {
        if (current.accessToken.isBlank()) {
            return
        }
        socketReconnectJob?.cancel()
        socket?.close(1000, "refresh")
        socket = api.openRealtimeSocket(current.apiBaseUrl, current.accessToken, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                if (webSocket != socket) return
                socketReconnectJob?.cancel()
                appendLog("Realtime socket connected.")
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                if (text.contains("jobs_available") || text.contains("connected")) {
                    scope.launch { fetchAndProcessJobs() }
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                if (webSocket != socket) return
                appendLog("Realtime socket failed: ${t.message}")
                scheduleSocketReconnect()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (webSocket != socket) return
                appendLog("Realtime socket closed. Reconnecting.")
                scheduleSocketReconnect()
            }
        })
    }

    private suspend fun reconnectWebSocket() {
        val settings = settingsStore.settingsSnapshot()
        if (!running.get() || settings.accessToken.isBlank()) return
        connectWebSocket(settings)
    }

    private fun scheduleSocketReconnect() {
        if (!running.get()) return
        if (socketReconnectJob?.isActive == true) return
        socketReconnectJob = scope.launch {
            val settings = settingsStore.settingsSnapshot()
            if (settings.accessToken.isBlank()) return@launch
            delay(SOCKET_RECONNECT_DELAY_MS)
            reconnectWebSocket()
        }
    }

    private suspend fun syncStateFromSettings() {
        val settings = settingsStore.settingsSnapshot()
        state.value = state.value.copy(
            paired = settings.accessToken.isNotBlank(),
            agentName = settings.agentName,
            apiBaseUrl = settings.apiBaseUrl,
            merchantSaasUrl = settings.merchantSaasUrl,
            selectedPrinterTempId = settings.selectedPrinterTempId,
            pairedAgentId = settings.pairedAgentId,
            hiddenPrinterTempIds = settings.hiddenPrinterTempIds,
        )
    }

    private suspend fun applyHidePrinter(tempId: String) {
        settingsStore.update { settings ->
            val nextHidden = (settings.hiddenPrinterTempIds + tempId).distinct()
            val nextSelected = if (settings.selectedPrinterTempId == tempId) "" else settings.selectedPrinterTempId
            settings.copy(hiddenPrinterTempIds = nextHidden, selectedPrinterTempId = nextSelected)
        }
        syncStateFromSettings()
        syncDiscoveredPrinters()
    }

    private fun currentSelectedPrinterName(): String {
        val selected = state.value.discoveredPrinters.firstOrNull { it.tempId == state.value.selectedPrinterTempId }
        return selected?.name.orEmpty()
    }

    private fun appendLog(message: String) {
        val line = "${formatNow()}: $message"
        state.value = state.value.copy(logs = (listOf(line) + state.value.logs).take(120))
    }

    private fun formatNow(): String = timeFormatter.format(Instant.now())
}
