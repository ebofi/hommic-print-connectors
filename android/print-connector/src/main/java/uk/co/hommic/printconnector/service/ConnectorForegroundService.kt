package uk.co.hommic.printconnector.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import uk.co.hommic.printconnector.R

class ConnectorForegroundService : Service() {
    override fun onCreate() {
        super.onCreate()
        runCatching {
            ConnectorContainer.init(applicationContext)
            createChannel()
            startForeground(NOTIFICATION_ID, buildNotification())
            ConnectorContainer.runtime.start()
        }.onFailure { error ->
            Log.e("HommicConnector", "Connector foreground service failed during startup", error)
            stopSelf()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        ConnectorContainer.runtime.start()
        return START_STICKY
    }

    override fun onDestroy() {
        ConnectorContainer.runtime.stop()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.foreground_notification_title),
            NotificationManager.IMPORTANCE_LOW,
        )
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_connector)
            .setContentTitle(getString(R.string.foreground_notification_title))
            .setContentText(getString(R.string.foreground_notification_text))
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val CHANNEL_ID = "hommic_print_connector"
        private const val NOTIFICATION_ID = 1001
    }
}
