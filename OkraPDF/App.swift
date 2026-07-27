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
                .frame(minWidth: 1_080, minHeight: 680)
                .onOpenURL(perform: appState.openPDF)
        }
        .defaultSize(width: 1_320, height: 820)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Open PDF…", action: appState.openPDFPicker)
                    .keyboardShortcut("o", modifiers: .command)
            }
        }
    }
}
