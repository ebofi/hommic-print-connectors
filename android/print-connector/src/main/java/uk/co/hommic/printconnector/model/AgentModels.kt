package uk.co.hommic.printconnector.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
data class PairVerifyRequest(
    val pairing_code: String,
    val name: String,
    val platform: String = "android",
    val app_version: String,
    val metadata: Map<String, String> = emptyMap(),
)

@Serializable
data class PairVerifyResponse(
    val agent_id: String,
    val access_token: String,
    val heartbeat_interval_seconds: Int,
    val queue_poll_interval_seconds: Int,
)

@Serializable
data class HeartbeatRequest(
    val app_version: String,
    val status: String,
    val metadata: Map<String, String> = emptyMap(),
)

@Serializable
data class DiscoveredPrintersRequest(
    val printers: List<DiscoveredPrinterPayload>,
)

@Serializable
data class DiscoveredPrinterPayload(
    val temp_id: String,
    val name: String,
    val type: String,
    val connection_mode: String,
    val vendor: String = "",
    val model: String = "",
    val serial_number: String? = null,
    val mac_address: String? = null,
    val ip_address: String? = null,
    val port: Int? = 9100,
    val paper_width: String = "80mm",
    val metadata: Map<String, String> = emptyMap(),
)

@Serializable
data class BackendPrinter(
    val id: String,
    val name: String,
    val type: String,
    val connection_mode: String,
    val paper_width: String,
    val metadata: Map<String, String> = emptyMap(),
)

@Serializable
data class PrintJob(
    val id: String,
    val printer_device_id: String? = null,
    val document_type: String,
    val status: String,
    val template_profile_id: String? = null,
    val template_version_id: String? = null,
    val layout_spec_json: Map<String, JsonElement> = emptyMap(),
    val rendered_format: String,
    val rendered_content: String? = null,
    val payload_json: Map<String, String> = emptyMap(),
    val claim_token: String = "",
    val claim_expires_at: String? = null,
    val last_delivery_attempt_at: String? = null,
    val connector_ack_at: String? = null,
)

@Serializable
data class ClaimJobRequest(
    val printer_device_id: String? = null,
)

@Serializable
data class JobStatusRequest(
    val status: String,
    val error_message: String? = null,
    val raw_response: Map<String, String>? = null,
)

@Serializable
data class PrinterStatusRequest(
    val status: String,
    val metadata: Map<String, String> = emptyMap(),
)

@Serializable
data class LanPrinterDraft(
    val name: String,
    val ipAddress: String,
    val port: Int,
    val paperWidth: String,
)

data class LocalPrinter(
    val tempId: String,
    val name: String,
    val type: String,
    val connectionMode: String = "android_agent",
    val vendor: String = "",
    val model: String = "",
    val serialNumber: String? = null,
    val macAddress: String? = null,
    val ipAddress: String? = null,
    val port: Int? = 9100,
    val paperWidth: String = "80mm",
    val metadata: Map<String, String> = emptyMap(),
    val backendPrinterId: String? = null,
) {
    fun toPayload(): DiscoveredPrinterPayload = DiscoveredPrinterPayload(
        temp_id = tempId,
        name = name,
        type = type,
        connection_mode = connectionMode,
        vendor = vendor,
        model = model,
        serial_number = serialNumber,
        mac_address = macAddress,
        ip_address = ipAddress,
        port = port,
        paper_width = paperWidth,
        metadata = metadata,
    )
}

data class ConnectorState(
    val paired: Boolean = false,
    val running: Boolean = false,
    val agentName: String = "",
    val apiBaseUrl: String = "",
    val merchantSaasUrl: String = "",
    val pairingCode: String = "",
    val selectedPrinterTempId: String = "",
    val pairedAgentId: String = "",
    val online: Boolean = false,
    val statusMessage: String = "Ready to pair",
    val lastHeartbeatAt: String = "",
    val discoveredPrinters: List<LocalPrinter> = emptyList(),
    val hiddenPrinterTempIds: List<String> = emptyList(),
    val logs: List<String> = emptyList(),
)
