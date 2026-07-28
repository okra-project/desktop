import AppKit
import SwiftUI

@main
struct okraPDFApp: App {
    @StateObject private var appState = AppState()

    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    var body: some Scene {
        WindowGroup("Okra") {
            ContentView()
                .environmentObject(appState)
                .frame(minWidth: 1_080, minHeight: 680)
                .onOpenURL(perform: appState.openPDF)
        }
        .defaultSize(width: 1_320, height: 820)
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Open PDF…", action: appState.openPDFPicker)
                    .keyboardShortcut("o", modifiers: .command)
            }
            CommandGroup(after: .appInfo) {
                Button("Check for Updates…") {
                    Task { await appState.checkForUpdates(manual: true) }
                }
            }
        }
    }
}
