// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "okraPDF",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "Okra",
            path: "OkraPDF",
            resources: [
                .copy("AppIcon.png"),
                .copy("ProviderScripts")
            ]
        ),
        .testTarget(
            name: "okraPDFTests",
            dependencies: ["Okra"],
            path: "Tests"
        )
    ]
)
