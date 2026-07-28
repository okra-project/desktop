import Foundation
import Testing
@testable import Okra

struct DesktopUpdateCheckerTests {
    @Test("Versions parse and order beta tags and stable cores")
    func versionOrdering() throws {
        let beta12 = try #require(DesktopVersion("0.5.0-beta.12"))
        let beta13 = try #require(DesktopVersion("0.5.0-beta.13"))
        let stable = try #require(DesktopVersion("0.5.0"))
        let nextMinorBeta = try #require(DesktopVersion("0.6.0-beta.1"))

        #expect(beta12 < beta13)
        #expect(beta13 < stable)
        #expect(stable < nextMinorBeta)
        #expect(beta12 < nextMinorBeta)
        #expect(DesktopVersion("0.5.0-beta.12") == beta12)
    }

    @Test("Malformed versions are rejected")
    func malformedVersionsAreRejected() {
        #expect(DesktopVersion("") == nil)
        #expect(DesktopVersion("0.5") == nil)
        #expect(DesktopVersion("0.5.0-beta") == nil)
        #expect(DesktopVersion("0.5.0-rc.1") == nil)
        #expect(DesktopVersion("latest") == nil)
    }

    @Test("Newest non-draft desktop tag wins over older and non-desktop tags")
    func latestReleaseSelection() throws {
        let json = """
        [
            {"tag_name": "desktop-v0.5.0-beta.12", "html_url": "https://example.com/beta12", "draft": false},
            {"tag_name": "desktop-v0.5.0-beta.13", "html_url": "https://example.com/beta13", "draft": true},
            {"tag_name": "web-v0.3.17", "html_url": "https://example.com/web", "draft": false},
            {"tag_name": "desktop-v0.5.0-beta.11", "html_url": "https://example.com/beta11", "draft": false}
        ]
        """
        let latest = DesktopUpdateChecker().latestRelease(from: Data(json.utf8))

        let update = try #require(latest)
        #expect(update.versionString == "0.5.0-beta.12")
        #expect(update.tag == "desktop-v0.5.0-beta.12")
        #expect(update.url.absoluteString == "https://example.com/beta12")
    }

    @Test("Checker reports a newer beta as available")
    func newerBetaIsReported() async throws {
        let json = """
        [{"tag_name": "desktop-v0.5.0-beta.13", "html_url": "https://example.com/beta13", "draft": false}]
        """
        let checker = DesktopUpdateChecker { _ in Data(json.utf8) }

        let status = await checker.check(currentVersion: "0.5.0-beta.12")
        guard case .updateAvailable(let update) = status else {
            Issue.record("Expected an available update, got \(status)")
            return
        }
        #expect(update.versionString == "0.5.0-beta.13")
    }

    @Test("Running the newest beta reports up to date")
    func currentBetaIsUpToDate() async {
        let json = """
        [{"tag_name": "desktop-v0.5.0-beta.12", "html_url": "https://example.com/beta12", "draft": false}]
        """
        let checker = DesktopUpdateChecker { _ in Data(json.utf8) }

        #expect(await checker.check(currentVersion: "0.5.0-beta.12") == .upToDate)
    }

    @Test("Failed or unreadable checks stay silent instead of inventing state")
    func failedChecksStaySilent() async {
        let failing = DesktopUpdateChecker { _ in throw URLError(.notConnectedToInternet) }
        #expect(await failing.check(currentVersion: "0.5.0-beta.12") == .unknown)

        let garbage = DesktopUpdateChecker { _ in Data("not json".utf8) }
        #expect(await garbage.check(currentVersion: "0.5.0-beta.12") == .unknown)

        let empty = DesktopUpdateChecker { _ in Data("[]".utf8) }
        #expect(await empty.check(currentVersion: "0.5.0-beta.12") == .unknown)
    }
}

private func makeUpdateJSON(version: String) -> Data {
    Data("""
    [{"tag_name": "desktop-v\(version)", "html_url": "https://example.com/\(version)", "draft": false}]
    """.utf8)
}

@MainActor
struct AppStateUpdateCheckTests {

    @Test("Dismissed update stays hidden until a newer tag appears")
    func dismissedUpdateStaysHidden() async throws {
        let workspace = try TestWorkspace(prefix: "okra-update-dismiss")
        let checker = DesktopUpdateChecker { _ in makeUpdateJSON(version: "0.5.0-beta.13") }
        let state = AppState(
            localProcessing: LocalProcessingCoordinator(
                providers: [FixtureProcessingProvider()],
                runsRoot: workspace.runsRoot,
                userDefaults: workspace.defaults
            ),
            updateChecker: checker,
            currentAppVersion: "0.5.0-beta.12",
            updateDefaults: workspace.defaults
        )

        await state.checkForUpdates()
        #expect(state.visibleUpdate?.versionString == "0.5.0-beta.13")

        state.dismissUpdateBanner()
        #expect(state.visibleUpdate == nil)

        await state.checkForUpdates()
        #expect(state.visibleUpdate == nil)
    }

    @Test("Repeat launch checks are throttled to one per interval")
    func launchChecksAreThrottled() async throws {
        let workspace = try TestWorkspace(prefix: "okra-update-throttle")
        let counter = FetchCounter()
        let checker = DesktopUpdateChecker { [counter] _ in
            counter.increment()
            return makeUpdateJSON(version: "0.5.0-beta.13")
        }
        let state = AppState(
            localProcessing: LocalProcessingCoordinator(
                providers: [FixtureProcessingProvider()],
                runsRoot: workspace.runsRoot,
                userDefaults: workspace.defaults
            ),
            updateChecker: checker,
            currentAppVersion: "0.5.0-beta.12",
            updateDefaults: workspace.defaults
        )

        await state.checkForUpdatesIfDue()
        await state.checkForUpdatesIfDue()
        #expect(counter.value == 1)
    }

    @Test("Manual up-to-date check surfaces a truthful notice")
    func manualUpToDateCheckSurfacesNotice() async throws {
        let workspace = try TestWorkspace(prefix: "okra-update-manual")
        let checker = DesktopUpdateChecker { _ in makeUpdateJSON(version: "0.5.0-beta.12") }
        let state = AppState(
            localProcessing: LocalProcessingCoordinator(
                providers: [FixtureProcessingProvider()],
                runsRoot: workspace.runsRoot,
                userDefaults: workspace.defaults
            ),
            updateChecker: checker,
            currentAppVersion: "0.5.0-beta.12",
            updateDefaults: workspace.defaults
        )

        await state.checkForUpdates(manual: true)
        #expect(state.updateStatus == .upToDate)
        #expect(state.manualUpdateCheckNotice?.contains("latest") == true)
    }
}

private final class FetchCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0

    var value: Int {
        lock.lock()
        defer { lock.unlock() }
        return count
    }

    func increment() {
        lock.lock()
        count += 1
        lock.unlock()
    }
}
