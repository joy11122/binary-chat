import Capacitor
import Foundation

@objc(BinaryChatE2EEBridgePlugin)
public class BinaryChatE2EEBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BinaryChatE2EEBridgePlugin"
    public let jsName = "BinaryChatE2EEBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getCapabilities", returnType: CAPPluginReturnPromise)
    ]

    @objc func getCapabilities(_ call: CAPPluginCall) {
        call.resolve([
            "available": false,
            "platform": "ios",
            "reason": "not_implemented"
        ])
    }
}
