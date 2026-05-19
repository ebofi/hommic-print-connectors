package uk.co.hommic.printconnector.network

import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import uk.co.hommic.printconnector.model.BackendPrinter
import uk.co.hommic.printconnector.model.ClaimJobRequest
import uk.co.hommic.printconnector.model.DiscoveredPrintersRequest
import uk.co.hommic.printconnector.model.HeartbeatRequest
import uk.co.hommic.printconnector.model.JobStatusRequest
import uk.co.hommic.printconnector.model.PairVerifyRequest
import uk.co.hommic.printconnector.model.PairVerifyResponse
import uk.co.hommic.printconnector.model.PrintJob
import uk.co.hommic.printconnector.model.PrinterStatusRequest

class PrintAgentApi(
    private val json: Json = Json { ignoreUnknownKeys = true },
    private val client: OkHttpClient = OkHttpClient.Builder().build(),
) {
    private val mediaType = "application/json".toMediaType()

    suspend fun verifyPairing(baseUrl: String, payload: PairVerifyRequest): PairVerifyResponse =
        json.decodeFromString(
            executePost(
                baseUrl = baseUrl,
                path = "/api/print-agent/pair/verify",
                bodyJson = json.encodeToString(PairVerifyRequest.serializer(), payload),
            )
        )

    suspend fun heartbeat(baseUrl: String, token: String, payload: HeartbeatRequest) {
        executePost(
            baseUrl = baseUrl,
            path = "/api/print-agent/heartbeat",
            token = token,
            bodyJson = json.encodeToString(HeartbeatRequest.serializer(), payload),
        )
    }

    suspend fun fetchJobs(baseUrl: String, token: String): List<PrintJob> =
        json.decodeFromString(executeGet(baseUrl, "/api/print-agent/jobs", token))

    suspend fun claimJob(baseUrl: String, token: String, jobId: String, printerDeviceId: String?): PrintJob =
        json.decodeFromString(
            executePost(
                baseUrl = baseUrl,
                path = "/api/print-agent/jobs/$jobId/claim",
                token = token,
                bodyJson = json.encodeToString(ClaimJobRequest.serializer(), ClaimJobRequest(printerDeviceId)),
            )
        )

    suspend fun updateJobStatus(baseUrl: String, token: String, jobId: String, payload: JobStatusRequest): PrintJob =
        json.decodeFromString(
            executePost(
                baseUrl = baseUrl,
                path = "/api/print-agent/jobs/$jobId/status",
                token = token,
                bodyJson = json.encodeToString(JobStatusRequest.serializer(), payload),
            )
        )

    suspend fun syncDiscoveredPrinters(baseUrl: String, token: String, payload: DiscoveredPrintersRequest): List<BackendPrinter> =
        json.decodeFromString(
            executePost(
                baseUrl = baseUrl,
                path = "/api/print-agent/printers/discovered",
                token = token,
                bodyJson = json.encodeToString(DiscoveredPrintersRequest.serializer(), payload),
            )
        )

    suspend fun updatePrinterStatus(baseUrl: String, token: String, printerId: String, payload: PrinterStatusRequest): BackendPrinter =
        json.decodeFromString(
            executePost(
                baseUrl = baseUrl,
                path = "/api/print-agent/printers/$printerId/status",
                token = token,
                bodyJson = json.encodeToString(PrinterStatusRequest.serializer(), payload),
            )
        )

    suspend fun deletePrinter(baseUrl: String, token: String, printerId: String) {
        executeDelete(
            baseUrl = baseUrl,
            path = "/api/print-agent/printers/$printerId",
            token = token,
        )
    }

    suspend fun unpair(baseUrl: String, token: String) {
        executePost(
            baseUrl = baseUrl,
            path = "/api/print-agent/unpair",
            token = token,
            bodyJson = "{}",
        )
    }

    fun openRealtimeSocket(baseUrl: String, token: String, listener: WebSocketListener): WebSocket {
        val httpUrl = baseUrl.toHttpUrl()
        val wsScheme = if (httpUrl.isHttps) "wss" else "ws"
        val url = httpUrl.newBuilder()
            .scheme(wsScheme)
            .addPathSegments("api/print-agent/ws")
            .addQueryParameter("token", token)
            .build()
        return client.newWebSocket(
            Request.Builder().url(url).build(),
            listener,
        )
    }

    private fun executePost(
        baseUrl: String,
        path: String,
        token: String? = null,
        bodyJson: String,
    ): String {
        val url = baseUrl.toHttpUrl().newBuilder().addPathSegments(path.trimStart('/')).build()
        val request = Request.Builder()
            .url(url)
            .post(bodyJson.toRequestBody(mediaType))
            .header("Content-Type", "application/json")
            .apply {
                if (!token.isNullOrBlank()) {
                    header("X-Print-Agent-Token", token)
                }
            }
            .build()
        client.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw IllegalStateException("HTTP ${response.code}: $raw")
            }
            return raw
        }
    }

    private fun executeGet(baseUrl: String, path: String, token: String): String {
        val url = baseUrl.toHttpUrl().newBuilder().addPathSegments(path.trimStart('/')).build()
        val request = Request.Builder()
            .url(url)
            .get()
            .header("X-Print-Agent-Token", token)
            .build()
        client.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw IllegalStateException("HTTP ${response.code}: $raw")
            }
            return raw
        }
    }

    private fun executeDelete(baseUrl: String, path: String, token: String): String {
        val url = baseUrl.toHttpUrl().newBuilder().addPathSegments(path.trimStart('/')).build()
        val request = Request.Builder()
            .url(url)
            .delete()
            .header("X-Print-Agent-Token", token)
            .build()
        client.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw IllegalStateException("HTTP ${response.code}: $raw")
            }
            return raw
        }
    }
}
