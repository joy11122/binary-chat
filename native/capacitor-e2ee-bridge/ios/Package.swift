// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "BinaryChatE2EEBridge",
    platforms: [.iOS(.v14)],
    products: [
        .library(name: "BinaryChatE2EEBridge", targets: ["BinaryChatE2EEBridge"])
    ],
    dependencies: [
        .package(name: "Capacitor", path: "../../../node_modules/@capacitor/ios")
    ],
    targets: [
        .target(
            name: "BinaryChatE2EEBridge",
            dependencies: ["Capacitor"],
            path: "Sources"
        )
    ]
)
