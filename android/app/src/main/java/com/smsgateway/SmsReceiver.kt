package com.smsgateway

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Telephony
import android.telephony.SmsMessage
import android.telephony.SubscriptionManager
import android.util.Log
import org.json.JSONObject

class SmsReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    val bundle = intent.extras ?: return
    val pdus = bundle.get("pdus") as? Array<*> ?: return
    val format = bundle.getString("format")
    if (pdus.isEmpty()) return

    val messages = mutableListOf<SmsMessage>()
    for (pdu in pdus) {
      if (pdu !is ByteArray) continue
      val msg = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && format != null) {
          SmsMessage.createFromPdu(pdu, format)
        } else {
          @Suppress("DEPRECATION")
          SmsMessage.createFromPdu(pdu)
        }
      } catch (e: Exception) {
        continue
      }
      messages.add(msg)
    }
    if (messages.isEmpty()) return

    val sender = messages.first().originatingAddress ?: ""
    val body = messages.joinToString("") { it.messageBody ?: "" }
    val timestampMillis = messages.first().timestampMillis
    val subId = extractSubscriptionId(intent)
    val slotIndex = resolveSlotIndex(context, subId)

    InboundQueue.append(context, sender, body, timestampMillis, slotIndex, subId?.toString())
    SmsNativeModule.emitInbound(context)
  }

  private fun extractSubscriptionId(intent: Intent): Int? {
    val subId = intent.getIntExtra("subscription", SubscriptionManager.INVALID_SUBSCRIPTION_ID)
    if (subId != SubscriptionManager.INVALID_SUBSCRIPTION_ID) return subId
    return intent.getIntExtra("subId", SubscriptionManager.INVALID_SUBSCRIPTION_ID).takeIf { it != SubscriptionManager.INVALID_SUBSCRIPTION_ID }
  }

  private fun resolveSlotIndex(context: Context, subId: Int?): Int? {
    if (subId == null) return null
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP_MR1) return null
    val sm = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager?
    try {
      return sm?.getActiveSubscriptionInfo(subId)?.simSlotIndex
    } catch (e: Exception) {
      return null
    }
  }
}