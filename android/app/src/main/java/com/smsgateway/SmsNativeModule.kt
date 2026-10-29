package com.smsgateway

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.telephony.SmsManager
import android.telephony.SubscriptionInfo
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

class SmsNativeModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val requestSeq = AtomicInteger(1000)
  private var activePermissionListener: PermissionListener? = null

  override fun getName(): String = "SmsNative"

  @ReactMethod
  fun getDeviceInfo(promise: Promise) {
    Thread {
      try {
        val context = reactApplicationContext
        val telephony = try {
          context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager?
        } catch (e: Exception) {
          null
        }
        val subscriptionManager = try {
          context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager?
        } catch (e: Exception) {
          null
        }
        val sims = ArrayList<WritableMap>()
        var simsCount = 0
        try {
          val subs = subscriptionManager?.activeSubscriptionInfoList
          if (subs != null) {
            simsCount = subs.size
            for (info in subs) {
              sims.add(simToMap(info))
            }
          }
        } catch (e: SecurityException) {
          simsCount = 0
        } catch (e: Exception) {
          simsCount = 0
        }
        val simState = try {
          telephony?.simState ?: TelephonyManager.SIM_STATE_UNKNOWN
        } catch (e: SecurityException) {
          TelephonyManager.SIM_STATE_UNKNOWN
        }
        val simCount = if (simsCount > 0) {
          simsCount
        } else if (simState != TelephonyManager.SIM_STATE_ABSENT &&
          simState != TelephonyManager.SIM_STATE_UNKNOWN
        ) {
          1
        } else {
          0
        }
        val battery = batteryInfo()
        val map = Arguments.createMap()
        map.putInt("battery", battery.first)
        map.putBoolean("charging", battery.second)
        map.putString("network", networkTypeName(telephony))
        map.putInt("signalStrength", signalStrengthLevel(telephony))
        map.putInt("simCount", simCount)
        map.putArray("sims", Arguments.makeNativeArray(sims))
        promise.resolve(map)
      } catch (e: Exception) {
        promise.reject("GET_DEVICE_INFO_FAILED", e.message)
      }
    }.start()
  }

  @ReactMethod
  fun sendSms(phoneNumber: String, message: String, subscriptionId: Double, promise: Promise) {
    if (phoneNumber.isBlank() || message.isBlank()) {
      promise.resolve(errorResult("ARGUMENT_NULL", "Phone number or message is empty"))
      return
    }
    val smsManager = try {
      resolveSmsManager(subscriptionId.toInt())
    } catch (e: SecurityException) {
      promise.resolve(errorResult("PERMISSION_DENIED", e.message))
      return
    } catch (e: Exception) {
      promise.resolve(errorResult("MODEM_ERROR", e.message ?: "Unable to get SmsManager"))
      return
    }
    val parts = try {
      smsManager.divideMessage(message)
    } catch (e: Exception) {
      promise.resolve(errorResult("MODEM_ERROR", e.message ?: "Unable to divide message"))
      return
    }
    if (parts.isEmpty()) {
      promise.resolve(errorResult("ARGUMENT_NULL", "Message produced no parts"))
      return
    }
    val context = reactApplicationContext
    val token = requestSeq.addAndGet(10)
    val partCount = parts.size
    val settledNow = AtomicBoolean(false)
    val handler = Handler(Looper.getMainLooper())
    val sentActions = (0 until partCount).map { "$SMS_ACTION_PREFIX.SENT.$token.$it" }
    val deliveredActions = (0 until partCount).map { "$SMS_ACTION_PREFIX.DELIV.$token.$it" }
    val sentPendingIntents = ArrayList<PendingIntent>()
    val deliveredPendingIntents = ArrayList<PendingIntent>()
    var receiverLocal: BroadcastReceiver? = null

    val settle: (WritableMap) -> Unit = { result ->
      if (settledNow.compareAndSet(false, true)) {
        handler.removeCallbacksAndMessages(null)
        val receiverToUnregister = receiverLocal
        handler.post(Runnable {
          receiverToUnregister?.let { value ->
            runCatching {
              context.unregisterReceiver(value)
            }
          }
        })
        sentPendingIntents.forEach { pending ->
          runCatching { pending.cancel() }
        }
        deliveredPendingIntents.forEach { pending ->
          runCatching { pending.cancel() }
        }
        promise.resolve(result)
      }
    }

    fun doSend(index: Int) {
      val sentAction = sentActions[index]
      val deliveredAction = deliveredActions[index]
      val sentPending = PendingIntent.getBroadcast(
        context,
        token + index,
        Intent(sentAction).setPackage(context.packageName),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
      val deliveredPending = PendingIntent.getBroadcast(
        context,
        token + 1000 + index,
        Intent(deliveredAction).setPackage(context.packageName),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
      sentPendingIntents.add(sentPending)
      deliveredPendingIntents.add(deliveredPending)
      try {
        smsManager.sendTextMessage(phoneNumber, null, parts[index], sentPending, deliveredPending)
      } catch (e: SecurityException) {
        settle(errorResult("PERMISSION_DENIED", "SEND_SMS permission not granted"))
      } catch (e: Exception) {
        settle(errorResult("MODEM_ERROR", e.message ?: "SMS send failed"))
      }
    }

    val receiver = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context?, intent: Intent?) {
        val action = intent?.action ?: return
        if (!action.startsWith(SMS_ACTION_PREFIX)) {
          return
        }
        if (settledNow.get()) {
          return
        }
        val isSent = action.contains(".SENT.")
        val isDelivered = action.contains(".DELIV.")
        if (!isSent && !isDelivered) {
          return
        }
        val partIndex = action.substringAfterLast('.').toIntOrNull() ?: 0
        if (isDelivered) {
          return
        }
        if (resultCode == Activity.RESULT_OK) {
          if (partIndex == partCount - 1) {
            settle(successResult())
          } else {
            doSend(partIndex + 1)
          }
        } else {
          val (code, messageText) = mapResultCode(resultCode)
          settle(errorResult(code, messageText))
        }
      }
    }
    receiverLocal = receiver

    val filter = IntentFilter().apply {
      sentActions.forEach { addAction(it) }
      deliveredActions.forEach { addAction(it) }
    }

    registerReceiverSafe(receiver, filter)
    handler.postDelayed(
      Runnable { settle(errorResult("TIMEOUT", "SMS send timed out")) },
      SMS_TIMEOUT_MS,
    )
    doSend(0)
  }

  @ReactMethod
  fun requestPermissions(promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.resolve(false)
      return
    }
    val context = reactApplicationContext
    val permissions = mutableListOf<String>()
    if (context.checkSelfPermission(Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
      permissions.add(Manifest.permission.SEND_SMS)
    }
    if (context.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
      permissions.add(Manifest.permission.READ_PHONE_STATE)
    }
    if (context.checkSelfPermission(Manifest.permission.READ_PHONE_NUMBERS) != PackageManager.PERMISSION_GRANTED) {
      permissions.add(Manifest.permission.READ_PHONE_NUMBERS)
    }
    if (permissions.isEmpty()) {
      promise.resolve(true)
      return
    }
    if (activity !is PermissionAwareActivity) {
      promise.resolve(false)
      return
    }
    val listener = PermissionListener { requestCode, _, grantResults ->
      if (requestCode == PERMISSION_REQUEST_CODE) {
        val granted = grantResults.isNotEmpty() &&
          grantResults.all { it == PackageManager.PERMISSION_GRANTED }
        promise.resolve(granted)
      }
      true
    }
    activePermissionListener = listener
    activity.requestPermissions(permissions.toTypedArray(), PERMISSION_REQUEST_CODE, listener)
  }

  @ReactMethod
  fun getDeviceMetadata(promise: Promise) {
    try {
      val context = reactApplicationContext
      val versionName = try {
        @Suppress("DEPRECATION")
        context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "1.0.0"
      } catch (e: Exception) {
        "1.0.0"
      }
      val map = Arguments.createMap()
      map.putString("platform", "android")
      map.putString("manufacturer", Build.MANUFACTURER)
      map.putString("model", Build.MODEL)
      map.putString("androidVersion", Build.VERSION.RELEASE)
      map.putString("appVersion", versionName)
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("GET_METADATA_FAILED", e.message)
    }
  }

  @ReactMethod
  fun getAndroidId(promise: Promise) {
    val id = Settings.Secure.getString(
      reactApplicationContext.contentResolver,
      Settings.Secure.ANDROID_ID,
    )
    if (id.isNullOrEmpty()) {
      promise.resolve(null)
    } else {
      promise.resolve(id)
    }
  }

  private fun resolveSmsManager(subscriptionId: Int): SmsManager {
    val context = reactApplicationContext
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val base = context.getSystemService(SmsManager::class.java) ?: SmsManager.getDefault()
      if (subscriptionId >= 0 && base.subscriptionId != subscriptionId) {
        return SmsManager.getSmsManagerForSubscriptionId(subscriptionId)
      }
      return base
    }
    @Suppress("DEPRECATION")
    return if (subscriptionId >= 0) {
      SmsManager.getSmsManagerForSubscriptionId(subscriptionId)
    } else {
      SmsManager.getDefault()
    }
  }

  private fun registerReceiverSafe(receiver: BroadcastReceiver, filter: IntentFilter) {
    val context = reactApplicationContext
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      @Suppress("DEPRECATION")
      context.registerReceiver(receiver, filter)
    }
  }

  private fun simToMap(info: SubscriptionInfo): WritableMap {
    val map = Arguments.createMap()
    map.putInt("slotIndex", info.simSlotIndex)
    map.putString(
      "phoneNumber",
      try {
        info.number.orEmpty()
      } catch (e: Exception) {
        ""
      },
    )
    map.putString(
      "carrierName",
      try {
        info.carrierName?.toString()
      } catch (e: Exception) {
        null
      },
    )
    map.putInt("subscriptionId", info.subscriptionId)
    return map
  }

  private fun batteryInfo(): Pair<Int, Boolean> {
    val status = reactApplicationContext.registerReceiver(
      null,
      IntentFilter(Intent.ACTION_BATTERY_CHANGED),
    )
    val level = status?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
    val scale = status?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
    val percent = if (level >= 0 && scale > 0) {
      ((level * 100) / scale).coerceIn(0, 100)
    } else {
      0
    }
    val state = status?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
    val charging = state == BatteryManager.BATTERY_STATUS_CHARGING ||
      state == BatteryManager.BATTERY_STATUS_FULL
    return Pair(percent, charging)
  }

  private fun networkTypeName(telephony: TelephonyManager?): String {
    if (telephony == null) {
      return "UNKNOWN"
    }
    val type = try {
      telephony.dataNetworkType
    } catch (e: SecurityException) {
      TelephonyManager.NETWORK_TYPE_UNKNOWN
    } catch (e: Exception) {
      TelephonyManager.NETWORK_TYPE_UNKNOWN
    }
    return when (type) {
      TelephonyManager.NETWORK_TYPE_GPRS -> "GPRS"
      TelephonyManager.NETWORK_TYPE_EDGE -> "EDGE"
      TelephonyManager.NETWORK_TYPE_UMTS -> "UMTS"
      TelephonyManager.NETWORK_TYPE_CDMA -> "CDMA"
      TelephonyManager.NETWORK_TYPE_EVDO_0 -> "EVDO_0"
      TelephonyManager.NETWORK_TYPE_EVDO_A -> "EVDO_A"
      TelephonyManager.NETWORK_TYPE_1xRTT -> "1xRTT"
      TelephonyManager.NETWORK_TYPE_HSDPA -> "HSDPA"
      TelephonyManager.NETWORK_TYPE_HSUPA -> "HSUPA"
      TelephonyManager.NETWORK_TYPE_HSPA -> "HSPA"
      TelephonyManager.NETWORK_TYPE_IDEN -> "IDEN"
      TelephonyManager.NETWORK_TYPE_EVDO_B -> "EVDO_B"
      TelephonyManager.NETWORK_TYPE_LTE -> "LTE"
      TelephonyManager.NETWORK_TYPE_EHRPD -> "EHRPD"
      TelephonyManager.NETWORK_TYPE_HSPAP -> "HSPAP"
      TelephonyManager.NETWORK_TYPE_GSM -> "GSM"
      TelephonyManager.NETWORK_TYPE_TD_SCDMA -> "TD_SCDMA"
      TelephonyManager.NETWORK_TYPE_IWLAN -> "IWLAN"
      TelephonyManager.NETWORK_TYPE_NR -> "5G"
      else -> "UNKNOWN"
    }
  }

  private fun signalStrengthLevel(telephony: TelephonyManager?): Int {
    if (telephony == null) {
      return -1
    }
    return try {
      val strength = telephony.signalStrength
      if (strength != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        strength.level
      } else {
        strength?.gsmSignalStrength ?: -1
      }
    } catch (e: SecurityException) {
      -1
    } catch (e: Exception) {
      -1
    }
  }

  private fun mapResultCode(code: Int): Pair<String, String> {
    return when (code) {
      SmsManager.RESULT_ERROR_GENERIC_FAILURE -> "MODEM_ERROR" to "Generic SMS failure"
      SmsManager.RESULT_ERROR_NO_SERVICE -> "NO_SERVICE" to "No mobile service"
      SmsManager.RESULT_ERROR_NULL_PDU -> "ARGUMENT_NULL" to "Null PDU returned"
      SmsManager.RESULT_ERROR_RADIO_OFF -> "RADIO_OFF" to "Radio is off"
      else -> "MODEM_ERROR" to "SMS transport failed with code $code"
    }
  }

  private fun successResult(): WritableMap {
    val map = Arguments.createMap()
    map.putBoolean("success", true)
    return map
  }

  private fun errorResult(code: String, message: String?): WritableMap {
    val map = Arguments.createMap()
    map.putBoolean("success", false)
    map.putString("errorCode", code)
    map.putString("errorMessage", message ?: "")
    return map
  }

  companion object {
    private const val SMS_ACTION_PREFIX = "com.smsgateway.SMS"
    private const val SMS_TIMEOUT_MS = 60000L
    private const val PERMISSION_REQUEST_CODE = 90210
  }
}