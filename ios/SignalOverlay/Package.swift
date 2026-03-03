// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SignalOverlay",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "SignalOverlay", targets: ["SignalOverlay"]),
        .library(name: "SignalOverlayUI", targets: ["SignalOverlayUI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/groue/GRDB.swift.git", from: "6.24.0"),
    ],
    targets: [
        .target(
            name: "SignalOverlay",
            dependencies: [.product(name: "GRDB", package: "GRDB.swift")],
            path: "Sources/SignalOverlay"
        ),
        .target(
            name: "SignalOverlayUI",
            dependencies: ["SignalOverlay"],
            path: "Sources/SignalOverlayUI"
        ),
        .testTarget(
            name: "SignalOverlayTests",
            dependencies: ["SignalOverlay", "SignalOverlayUI"],
            path: "Tests/SignalOverlayTests",
            resources: [.copy("Fixtures")]
        ),
    ]
)
