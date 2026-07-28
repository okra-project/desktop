import Sparkle

/// Owns the Sparkle updater for the app. Sparkle provides the whole
/// click-to-restart flow: background checks against the appcast, download,
/// EdDSA signature verification, install, and relaunch.
final class SparkleUpdaterController: ObservableObject {
    private let controller: SPUStandardUpdaterController

    init() {
        controller = SPUStandardUpdaterController(
            startingUpdater: true,
            updaterDelegate: nil,
            userDriverDelegate: nil
        )
    }

    /// Manual "Check for Updates…" action. Sparkle shows its own
    /// update-available / up-to-date / error UI for user-initiated checks.
    func checkForUpdates() {
        controller.checkForUpdates(nil)
    }
}
