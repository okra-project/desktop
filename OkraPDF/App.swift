import AppKit
import SwiftUI

@main
struct okraPDFApp: App {
    @StateObject private var appState = AppState()

    init() {
        NSApplication.shared.setActivationPolicy(.accessory)
    }

    var body: some Scene {
        MenuBarExtra("okraPDF", systemImage: "text.viewfinder") {
            ContentView()
                .environmentObject(appState)
                .frame(width: 420, height: 640)
        }
        .menuBarExtraStyle(.window)
    }
}
