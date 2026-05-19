package uk.co.hommic.printconnector.drivers

import android.content.Context
import android.hardware.usb.UsbManager
import android.util.Base64
import uk.co.hommic.printconnector.model.LocalPrinter
import uk.co.hommic.printconnector.model.PrintJob
import java.net.InetSocketAddress
import java.net.Socket
import java.util.UUID

class AndroidPrintRouter(private val context: Context) {
    fun print(job: PrintJob, printer: LocalPrinter): Map<String, String> {
        if (job.rendered_format != "escpos") {
            throw IllegalStateException("Android connector currently supports escpos jobs only")
        }
        val payload = job.rendered_content?.takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("Missing ESC/POS payload")
        val bytes = Base64.decode(payload, Base64.DEFAULT)

        return when (printer.type) {
            "escpos_bluetooth" -> BluetoothRawTransport.send(printer, bytes)
            "escpos_usb" -> UsbRawTransport(context).send(printer, bytes)
            "escpos_network" -> TcpRawTransport.send(printer, bytes)
            "sunmi_native" -> SunmiDriver(context).printRaw(printer, bytes)
            else -> throw IllegalStateException("Unsupported Android printer type ${printer.type}")
        }
    }
}

object BluetoothRawTransport {
    fun send(printer: LocalPrinter, payload: ByteArray): Map<String, String> {
        val mac = printer.macAddress ?: throw IllegalStateException("Bluetooth printer MAC address missing")
        val adapter = android.bluetooth.BluetoothAdapter.getDefaultAdapter()
            ?: throw IllegalStateException("Bluetooth adapter unavailable")
        val device = adapter.getRemoteDevice(mac)
        val uuid = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
        val socket = device.createRfcommSocketToServiceRecord(uuid)
        socket.connect()
        socket.outputStream.use { stream ->
            stream.write(payload)
            stream.flush()
        }
        socket.close()
        return mapOf("transport" to "bluetooth", "bytes" to payload.size.toString())
    }
}

class UsbRawTransport(private val context: Context) {
    fun send(printer: LocalPrinter, payload: ByteArray): Map<String, String> {
        val usbManager = context.getSystemService(UsbManager::class.java)
            ?: throw IllegalStateException("USB manager unavailable")
        val vendorId = printer.metadata["usb_vendor_id"]?.toIntOrNull()
        val productId = printer.metadata["usb_product_id"]?.toIntOrNull()
        val device = usbManager.deviceList.values.firstOrNull {
            (vendorId == null || it.vendorId == vendorId) &&
                (productId == null || it.productId == productId)
        } ?: throw IllegalStateException("USB printer not found")
        val connection = usbManager.openDevice(device) ?: throw IllegalStateException("USB permission or connection failed")
        if (device.interfaceCount <= 0) {
            throw IllegalStateException("USB interface not available")
        }
        val usbInterface = device.getInterface(0)
        val endpoint = (0 until usbInterface.endpointCount)
            .map { usbInterface.getEndpoint(it) }
            .firstOrNull { it.direction == android.hardware.usb.UsbConstants.USB_DIR_OUT }
            ?: throw IllegalStateException("USB OUT endpoint not found")
        connection.claimInterface(usbInterface, true)
        val sent = connection.bulkTransfer(endpoint, payload, payload.size, 10_000)
        connection.releaseInterface(usbInterface)
        connection.close()
        if (sent < 0) {
            throw IllegalStateException("USB bulk transfer failed")
        }
        return mapOf("transport" to "usb", "bytes" to sent.toString())
    }
}

object TcpRawTransport {
    fun send(printer: LocalPrinter, payload: ByteArray): Map<String, String> {
        val host = printer.ipAddress ?: throw IllegalStateException("Printer IP missing")
        val port = printer.port ?: 9100
        Socket().use { socket ->
            socket.connect(InetSocketAddress(host, port), 5_000)
            socket.getOutputStream().use { stream ->
                stream.write(payload)
                stream.flush()
            }
        }
        return mapOf("transport" to "tcp", "bytes" to payload.size.toString())
    }
}

class SunmiDriver(private val context: Context) {
    fun printRaw(@Suppress("UNUSED_PARAMETER") printer: LocalPrinter, @Suppress("UNUSED_PARAMETER") payload: ByteArray): Map<String, String> {
        throw IllegalStateException("Sunmi SDK bridge is not bundled yet. Install the Sunmi printer SDK AAR to enable native printing.")
    }
}
