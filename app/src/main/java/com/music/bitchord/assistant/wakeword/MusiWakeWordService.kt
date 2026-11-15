package com.music.bitchord.assistant.wakeword

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.music.bitchord.MainActivity
import com.music.bitchord.R
import com.music.bitchord.assistant.MusiAssistantManager
import com.music.bitchord.data.settings.AppSettings

/**
 * Android Foreground Service managing background wake-word detection for MUSI.
 * Complies with Android 14+ foregroundServiceType="microphone" requirements.
 *
 * Provides a persistent status notification with instant "Stop" action
 * to ensure complete user privacy and battery control.
 */
class MusiWakeWordService : Service() {

    companion object {
        private const val TAG = "MusiWakeWordService"
        const val CHANNEL_ID = "musi_wake_word_channel"
        const val NOTIFICATION_ID = 8842

        const val ACTION_START = "com.music.bitchord.assistant.action.START"
        const val ACTION_STOP = "com.music.bitchord.assistant.action.STOP"
        const val ACTION_WAKE_WORD = "com.music.bitchord.assistant.action.WAKE_WORD"

        fun start(context: Context) {
            val intent = Intent(context, MusiWakeWordService::class.java).apply {
                action = ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, MusiWakeWordService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START

        if (action == ACTION_STOP) {
            Log.d(TAG, "Stopping MusiWakeWordService via ACTION_STOP")
            stopWakeWord()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        if (!MusiWakeWordCoordinator.isForeground()) {
            Log.d(TAG, "App is not in foreground; refusing to start background wake-word service")
            stopSelf()
            return START_NOT_STICKY
        }

        // Start foreground with persistent notification
        val notification = buildNotification()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: SecurityException) {
            Log.w(TAG, "Foreground service microphone start refused: ${e.message}")
            stopSelf()
            return START_NOT_STICKY
        }

        startWakeWord()
        return START_NOT_STICKY
    }

    private fun startWakeWord() {
        if (!AppSettings.musiAssistantEnabled.value || !AppSettings.musiWakeWordEnabled.value) {
            Log.d(TAG, "MUSI or wake-word is disabled in settings; stopping service")
            stopSelf()
            return
        }

        MusiWakeWordDetector.start(this) { wakeWord ->
            Log.i(TAG, "Wake word detected in service: $wakeWord")
            handleWakeWordDetected()
        }
    }

    private fun handleWakeWordDetected() {
        // Launch or bring MainActivity to the front with wake word intent
        val activityIntent = Intent(this, MainActivity::class.java).apply {
            action = ACTION_WAKE_WORD
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        startActivity(activityIntent)
    }

    private fun stopWakeWord() {
        MusiWakeWordDetector.stop()
    }

    private fun buildNotification(): Notification {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openAppPendingIntent = PendingIntent.getActivity(
            this,
            0,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val stopIntent = Intent(this, MusiWakeWordService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPendingIntent = PendingIntent.getService(
            this,
            1,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("MUSI Assistant")
            .setContentText("Listening for 'Hey MUSI'...")
            .setSmallIcon(R.drawable.ic_notification_logo)
            .setContentIntent(openAppPendingIntent)
            .addAction(0, "Stop", stopPendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "MUSI Assistant Wake Word",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Monitors for 'Hey MUSI' wake word activation"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopWakeWord()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
