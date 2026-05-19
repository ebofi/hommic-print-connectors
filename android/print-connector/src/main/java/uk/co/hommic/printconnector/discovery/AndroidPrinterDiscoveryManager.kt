package uk.co.hommic.printconnector.discovery

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.hardware.usb.UsbManager
import android.os.Build
import uk.co.hommic.printconnector.data.ConnectorSettings
import uk.co.hommic.printconnector.model.LanPrinterDraft
import uk.co.hommic.printconnector.model.LocalPrinter
import java.util.Locale

class AndroidPrinterDiscoveryManager(private val context: Context) {
    @SuppressLint("MissingPermission")
    fun discover(settings: ConnectorSettings): List<LocalPrinter> {
        val printers = mutableListOf<LocalPrinter>()
        val bluetoothManager = context.getSystemService(BluetoothManager::class.java)
        val bluetoothAdapter = bluetoothManager?.adapter
        bluetoothAdapter?.bondedDevices?.forEach { device ->
            printers += LocalPrinter(
                tempId = "bt:${device.address}",
                name = device.name ?: "Bluetooth printer",
                type = "escpos_bluetooth",
                vendor = device.name?.substringBefore(" ") ?: "Bluetooth",
                model = device.name ?: "",
                macAddress = device.address,
                paperWidth = guessPaperWidth(device.name),
                metadata = mapOf("transport" to "bluetooth"),
            )
        }

        val usbManager = context.getSystemService(UsbManager::class.java)
        usbManager?.deviceList?.values?.forEach { device ->
            printers += LocalPrinter(
                tempId = "usb:${device.deviceId}",
                name = buildUsbName(device.manufacturerName, device.productName),
                type = "escpos_usb",
                vendor = device.manufacturerName ?: "USB",
                model = device.productName ?: "USB printer",
                serialNumber = device.serialNumber,
                paperWidth = guessPaperWidth(device.productName ?: device.manufacturerName),
                metadata = mapOf(
                    "transport" to "usb",
                    "usb_vendor_id" to device.vendorId.toString(),
                    "usb_product_id" to device.productId.toString(),
                ),
            )
        }

        printers += settings.lanPrinters.map { it.toLocalPrinter() }

        if (isSunmiDevice()) {
            printers += LocalPrinter(
                tempId = "sunmi:built-in",
                name = "Sunmi Built-in Printer",
                type = "sunmi_native",
                vendor = "Sunmi",
                model = Build.MODEL ?: "Sunmi",
                paperWidth = "80mm",
                metadata = mapOf("transport" to "sunmi"),
            )
        }

        return printers.distinctBy { it.tempId }
    }

    private fun buildUsbName(manufacturer: String?, product: String?): String {
        val left = manufacturer?.takeIf { it.isNotBlank() } ?: "USB"
        val right = product?.takeIf { it.isNotBlank() } ?: "Printer"
        return "$left $right".trim()
    }

    private fun guessPaperWidth(raw: String?): String {
        val value = raw.orEmpty().lowercase(Locale.getDefault())
        return when {
            "58" in value -> "58mm"
            "a4" in value -> "a4"
            else -> "80mm"
        }
    }

    private fun isSunmiDevice(): Boolean {
        val brand = Build.BRAND.orEmpty().lowercase(Locale.getDefault())
        val manufacturer = Build.MANUFACTURER.orEmpty().lowercase(Locale.getDefault())
        return "sunmi" in brand || "sunmi" in manufacturer
    }

    private fun LanPrinterDraft.toLocalPrinter(): LocalPrinter = LocalPrinter(
        tempId = "tcp:$ipAddress:$port",
        name = name,
        type = "escpos_network",
        vendor = "Network",
        model = "TCP Printer",
        ipAddress = ipAddress,
        port = port,
        paperWidth = paperWidth,
        metadata = mapOf("transport" to "tcp"),
    )
}
