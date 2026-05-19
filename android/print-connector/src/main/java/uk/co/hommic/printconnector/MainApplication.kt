package uk.co.hommic.printconnector

import android.app.Application
import uk.co.hommic.printconnector.service.ConnectorContainer

class MainApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        ConnectorContainer.init(this)
    }
}
