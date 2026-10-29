package com.smsgateway

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

class GatewayBootReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action
    if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    if (!GatewayService.isEnabled(context)) return
    val startIntent = Intent(context, GatewayService::class.java)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(startIntent)
      } else {
        context.startService(startIntent)
      }
    } catch (e: Exception) {
      Log.w("GatewayBootReceiver", "Failed to start service", e)
    }
  }
}