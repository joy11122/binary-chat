package com.binarychat.e2eebridge

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "BinaryChatE2EEBridge")
class BinaryChatE2EEBridgePlugin : Plugin() {
    @PluginMethod
    fun getCapabilities(call: PluginCall) {
        val result = JSObject()
        result.put("available", false)
        result.put("platform", "android")
        result.put("reason", "not_implemented")
        call.resolve(result)
    }
}
