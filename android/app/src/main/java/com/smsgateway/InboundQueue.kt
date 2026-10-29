package com.smsgateway

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.UUID

object InboundQueue {
  private const val PREFS = "smsgateway_inbound"
  private const val KEY_QUEUE = "queue"
  private const val MAX_QUEUE = 500
  private val lock = Any()

  private fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun formatUtc(millis: Long): String {
    val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
    return sdf.format(java.util.Date(millis))
  }

  fun append(context: Context, sender: String, message: String, receivedAtMillis: Long, slotIndex: Int?, subscriptionId: String?) {
    synchronized(lock) {
      val p = prefs(context)
      val array = JSONArray(p.getString(KEY_QUEUE, "[]"))
      val obj = JSONObject().apply {
        put("id", UUID.randomUUID().toString())
        put("sender", sender)
        put("message", message)
        put("receivedAt", formatUtc(receivedAtMillis))
        if (slotIndex != null) put("slotIndex", slotIndex)
        if (subscriptionId != null) put("subscriptionId", subscriptionId)
      }
      array.put(obj)
      while (array.length() > MAX_QUEUE) {
        array.remove(array.length() - 1)
      }
      p.edit().putString(KEY_QUEUE, array.toString()).apply()
    }
  }

  fun readAll(context: Context): JSONArray {
    synchronized(lock) {
      return JSONArray(prefs(context).getString(KEY_QUEUE, "[]"))
    }
  }

  fun removeIds(context: Context, ids: java.util.List<String>) {
    synchronized(lock) {
      val p = prefs(context)
      val array = JSONArray(p.getString(KEY_QUEUE, "[]"))
      val keep = JSONArray()
      val idSet = java.util.HashSet(ids)
      for (i in 0 until array.length()) {
        val o = array.optJSONObject(i)
        if (o != null && !idSet.contains(o.optString("id"))) {
          keep.put(o)
        }
      }
      p.edit().putString(KEY_QUEUE, keep.toString()).apply()
    }
  }
}