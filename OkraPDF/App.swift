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
        WindowGroup("okraPDF") {
            ContentView()
                .environmentObject(appState)
                .frame(minWidth: 980, minHeight: 680)
                .onOpenURL(perform: appState.openPDF)
        }
        .defaultSize(width: 1_180, height: 780)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Open PDF…", action: appState.openPDFPicker)
                    .keyboardShortcut("o", modifiers: .command)
            }
        }
    }
}
