import SwiftUI

@main
struct okraPDFApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup("okraPDF") {
            ContentView()
                .environmentObject(appState)
        }
        .defaultSize(width: 1_040, height: 720)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Open PDF…", action: appState.openPDFPicker)
                    .keyboardShortcut("o", modifiers: .command)
            }
        }
    }
}
