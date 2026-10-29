package com.smsgateway

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class GatewayService : HeadlessJsTaskService() {

  companion object {
    private const val PREFS = "smsgateway_service"
    private const val KEY_ENABLED = "enabled"
    private const val CHANNEL_ID = "gateway_channel"
    private const val NOTIFICATION_ID = 1001

    fun isEnabled(context: Context): Boolean {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      return prefs.getBoolean(KEY_ENABLED, false)
    }

    fun setEnabled(context: Context, enabled: Boolean) {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      prefs.edit().putBoolean(KEY_ENABLED, enabled).apply()
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (!isEnabled(this)) {
      stopForeground(true)
      stopSelf()
      return START_NOT_STICKY
    }
    startAsForeground()
    return super.onStartCommand(intent, flags, startId)
  }

  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    if (!isEnabled(this)) return null
    return HeadlessJsTaskConfig(
      "SMS_GATEWAY_BACKGROUND",
      Arguments.createMap(),
      0L,
      true,
      null
    )
  }

  private fun startAsForeground() {
    val notificationManager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "SMS Gateway",
        NotificationManager.IMPORTANCE_LOW
      )
      channel.description = "Keeps the SMS gateway running in the background"
      notificationManager.createNotificationChannel(channel)
    }
    val intent = Intent(this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val pendingIntent = PendingIntent.getActivity(
      this, 0, intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationCompat.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      NotificationCompat.Builder(this)
    }
    builder
      .setContentTitle("SMS Gateway active")
      .setContentText("Device is online and sending/receiving messages")
      .setSmallIcon(android.R.drawable.stat_notify_sync)
      .setContentIntent(pendingIntent)
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
    val notification = builder.build()
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
    } else 0
    ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
  }

  override fun onDestroy() {
    super.onDestroy()
    stopForeground(Service.STOP_FOREGROUND_REMOVE)
  }
}