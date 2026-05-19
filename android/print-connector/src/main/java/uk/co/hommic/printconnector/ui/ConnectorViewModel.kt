package uk.co.hommic.printconnector.ui

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import uk.co.hommic.printconnector.model.LanPrinterDraft
import uk.co.hommic.printconnector.service.ConnectorContainer

class ConnectorViewModel : ViewModel() {
    private val runtime = ConnectorContainer.runtime
    val state = runtime.state()

    fun pair(code: String, agentName: String) = runtime.pair(code, agentName)
    fun rescan() = runtime.rescan()
    fun resyncNow() = runtime.resyncNow()
    fun toggleRuntime() = runtime.toggleRuntime()
    fun unpair() = runtime.unpair()
    fun selectPrinter(tempId: String) = runtime.selectPrinter(tempId)
    fun hidePrinter(tempId: String) = runtime.hidePrinter(tempId)
    fun deletePrinter(tempId: String) = runtime.deletePrinter(tempId)
    fun saveLanPrinter(name: String, host: String, port: Int, paperWidth: String) =
        runtime.saveLanPrinter(LanPrinterDraft(name, host, port, paperWidth))
}

class ConnectorViewModelFactory(@Suppress("UNUSED_PARAMETER") private val context: Context) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        @Suppress("UNCHECKED_CAST")
        return ConnectorViewModel() as T
    }
}
