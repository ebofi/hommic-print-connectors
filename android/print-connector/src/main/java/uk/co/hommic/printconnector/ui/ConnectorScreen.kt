package uk.co.hommic.printconnector.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import uk.co.hommic.printconnector.R
import uk.co.hommic.printconnector.model.ConnectorState
import uk.co.hommic.printconnector.model.LocalPrinter

@Composable
fun ConnectorScreen(
    state: ConnectorState,
    onPair: (String, String) -> Unit,
    onRescan: () -> Unit,
    onResyncNow: () -> Unit,
    onToggleRunning: () -> Unit,
    onUnpair: () -> Unit,
    onSelectPrinter: (String) -> Unit,
    onHidePrinter: (String) -> Unit,
    onDeletePrinter: (String) -> Unit,
    onSaveLanPrinter: (String, String, Int, String) -> Unit,
) {
    val pairingCode = remember { mutableStateOf("") }
    val agentName = remember { mutableStateOf(if (state.agentName.isBlank()) "Front Counter Tablet" else state.agentName) }
    val lanName = remember { mutableStateOf("") }
    val lanHost = remember { mutableStateOf("") }
    val lanPort = remember { mutableStateOf("9100") }

    val connectionTone = when {
        state.paired && state.online -> Color(0xFF0F8A4B)
        state.paired -> Color(0xFFD97706)
        else -> Color(0xFFB42318)
    }
    val connectionLabel = when {
        state.paired && state.online -> "Connected"
        state.paired -> "Paired, waiting for heartbeat"
        else -> "Needs pairing"
    }
    val activePrinter = state.discoveredPrinters.firstOrNull { it.tempId == state.selectedPrinterTempId }

    MaterialTheme {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFFF7F7FB))
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                Column(
                    modifier = Modifier.padding(top = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Image(
                        painter = painterResource(id = R.drawable.hommic_wordmark),
                        contentDescription = "Hommic",
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(end = 128.dp),
                    )
                    Card(
                        shape = RoundedCornerShape(28.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                    ) {
                        Column(
                            modifier = Modifier.padding(20.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp),
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.Top,
                            ) {
                                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Text("Android Print Connector", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                                    Text(state.statusMessage, style = MaterialTheme.typography.bodyMedium, color = Color(0xFF667085))
                                }
                                StatusPill(label = connectionLabel, tint = connectionTone)
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                SummaryTile(label = "Device", value = agentName.value.ifBlank { "Android connector" }, modifier = Modifier.weight(1f))
                                SummaryTile(label = "Printers", value = state.discoveredPrinters.size.toString(), modifier = Modifier.weight(1f))
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                SummaryTile(label = "Last heartbeat", value = state.lastHeartbeatAt.ifBlank { "Not received yet" }, modifier = Modifier.weight(1f))
                                SummaryTile(label = "Active printer", value = activePrinter?.name ?: "Not selected", modifier = Modifier.weight(1f))
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Button(onClick = onToggleRunning, modifier = Modifier.weight(1f)) {
                                    Text(if (state.running) "Pause runtime" else "Start runtime")
                                }
                                OutlinedButton(onClick = onResyncNow, modifier = Modifier.weight(1f)) {
                                    Text("Resync now")
                                }
                            }
                            if (state.paired) {
                                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    OutlinedButton(onClick = onRescan, modifier = Modifier.weight(1f)) {
                                        Text("Sync printers")
                                    }
                                    OutlinedButton(onClick = onUnpair, modifier = Modifier.weight(1f)) {
                                        Text("Log out")
                                    }
                                }
                            }
                        }
                    }
                }
            }

            item {
                Card(shape = RoundedCornerShape(28.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text("Pair this device", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text("Use the Hommic merchant pairing code so this Android device appears with the same location naming used by the desktop daemon.", color = Color(0xFF667085))
                        OutlinedTextField(
                            value = agentName.value,
                            onValueChange = { agentName.value = it },
                            label = { Text("Device / location name") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                        OutlinedTextField(
                            value = pairingCode.value,
                            onValueChange = { pairingCode.value = it.uppercase() },
                            label = { Text("Pairing code") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                        Button(onClick = { onPair(pairingCode.value, agentName.value) }, modifier = Modifier.fillMaxWidth()) {
                            Text("Pair to Hommic")
                        }
                    }
                }
            }

            item {
                Card(shape = RoundedCornerShape(28.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text("Add LAN printer", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            OutlinedTextField(
                                value = lanName.value,
                                onValueChange = { lanName.value = it },
                                label = { Text("Printer name") },
                                modifier = Modifier.weight(1f),
                                singleLine = true,
                            )
                            OutlinedTextField(
                                value = lanPort.value,
                                onValueChange = { lanPort.value = it },
                                label = { Text("Port") },
                                modifier = Modifier.weight(0.45f),
                                singleLine = true,
                            )
                        }
                        OutlinedTextField(
                            value = lanHost.value,
                            onValueChange = { lanHost.value = it },
                            label = { Text("IP address") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Button(
                                onClick = {
                                    val port = lanPort.value.toIntOrNull() ?: 9100
                                    onSaveLanPrinter(lanName.value, lanHost.value, port, "80mm")
                                    lanName.value = ""
                                    lanHost.value = ""
                                    lanPort.value = "9100"
                                },
                                modifier = Modifier.weight(1f),
                            ) {
                                Text("Save LAN printer")
                            }
                            OutlinedButton(onClick = onRescan, modifier = Modifier.weight(1f)) {
                                Text("Rescan now")
                            }
                        }
                    }
                }
            }

            item {
                SectionHeader(
                    title = "Discovered printers",
                    body = "Select the printer this device should use for jobs. Hide removes it from this device. Delete removes the mapped SaaS record too when available.",
                )
            }

            items(state.discoveredPrinters, key = { it.tempId }) { printer ->
                PrinterCard(
                    printer = printer,
                    selected = state.selectedPrinterTempId == printer.tempId,
                    onSelect = { onSelectPrinter(printer.tempId) },
                    onHide = { onHidePrinter(printer.tempId) },
                    onDelete = { onDeletePrinter(printer.tempId) },
                )
            }

            item {
                Card(shape = RoundedCornerShape(28.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Text("Connector logs", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        if (state.logs.isEmpty()) {
                            Text("No logs yet. Pair the connector and sync printers to start receiving runtime events.", color = Color(0xFF667085))
                        } else {
                            state.logs.take(12).forEach { line ->
                                Text(line, style = MaterialTheme.typography.bodySmall, color = Color(0xFF475467))
                            }
                        }
                    }
                }
            }

            item {
                Box(modifier = Modifier.padding(bottom = 28.dp))
            }
        }
    }
}

@Composable
private fun SectionHeader(title: String, body: String) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text(body, style = MaterialTheme.typography.bodySmall, color = Color(0xFF667085))
    }
}

@Composable
private fun StatusPill(label: String, tint: Color) {
    Surface(
        color = tint.copy(alpha = 0.12f),
        shape = RoundedCornerShape(999.dp),
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
            color = tint,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun SummaryTile(label: String, value: String, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
        shape = RoundedCornerShape(20.dp),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = Color(0xFF667085))
            Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = Color(0xFF101828))
        }
    }
}

@Composable
private fun PrinterCard(
    printer: LocalPrinter,
    selected: Boolean,
    onSelect: () -> Unit,
    onHide: () -> Unit,
    onDelete: () -> Unit,
) {
    val badge = printerBadge(printer)
    Card(
        shape = RoundedCornerShape(26.dp),
        colors = CardDefaults.cardColors(containerColor = if (selected) Color(0xFFFFF1F3) else Color.White),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(printer.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text("${formatPrinterKind(printer.type)} · ${printer.paperWidth}", style = MaterialTheme.typography.bodySmall, color = Color(0xFF667085))
                    Text(printer.backendPrinterId?.let { "Mapped to SaaS printer $it" } ?: "Not mapped to SaaS yet", style = MaterialTheme.typography.bodySmall, color = Color(0xFF475467))
                }
                StatusPill(label = badge, tint = Color(0xFFE11D48))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onSelect, modifier = Modifier.weight(1f)) {
                    Text(if (selected) "Selected for jobs" else "Use for jobs")
                }
                OutlinedButton(onClick = onHide, modifier = Modifier.weight(1f)) {
                    Text("Hide")
                }
            }
            OutlinedButton(onClick = onDelete, modifier = Modifier.fillMaxWidth()) {
                Text(if (printer.backendPrinterId != null) "Delete from device and SaaS" else "Delete from device")
            }
        }
    }
}

private fun printerBadge(printer: LocalPrinter): String {
    val name = "${printer.name} ${printer.vendor} ${printer.model}".lowercase()
    return when {
        name.contains("sunmi") -> "Sunmi"
        name.contains("bluetooth") -> "Bluetooth"
        printer.type.contains("network") -> "Network"
        printer.type.contains("usb") -> "USB"
        printer.type.contains("browser") || name.contains("pdf") -> "Virtual"
        else -> "Printer"
    }
}

private fun formatPrinterKind(value: String): String =
    value.replace("_", " ").split(" ").joinToString(" ") { part ->
        part.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
    }
