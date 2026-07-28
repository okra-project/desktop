import Foundation

/// A desktop release version such as `0.5.0-beta.12` or `0.5.0`.
/// A stable core ranks above any beta of the same core.
struct DesktopVersion: Comparable, Equatable, Sendable {
    let major: Int
    let minor: Int
    let patch: Int
    let beta: Int?

    init?(_ string: String) {
        let halves = string.split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false)
        let core = halves[0].split(separator: ".")
        guard core.count == 3,
              let major = Int(core[0]),
              let minor = Int(core[1]),
              let patch = Int(core[2]) else {
            return nil
        }
        self.major = major
        self.minor = minor
        self.patch = patch

        guard halves.count == 2 else {
            beta = nil
            return
        }
        let prerelease = halves[1]
        guard prerelease.hasPrefix("beta."),
              let beta = Int(prerelease.dropFirst("beta.".count)) else {
            return nil
        }
        self.beta = beta
    }

    static func < (lhs: DesktopVersion, rhs: DesktopVersion) -> Bool {
        if (lhs.major, lhs.minor, lhs.patch) != (rhs.major, rhs.minor, rhs.patch) {
            return (lhs.major, lhs.minor, lhs.patch) < (rhs.major, rhs.minor, rhs.patch)
        }
        switch (lhs.beta, rhs.beta) {
        case (nil, nil):
            return false
        case (nil, _):
            return false
        case (_, nil):
            return true
        case let (lhsBeta?, rhsBeta?):
            return lhsBeta < rhsBeta
        }
    }
}

struct DesktopUpdate: Equatable, Sendable {
    let version: DesktopVersion
    let versionString: String
    let tag: String
    let url: URL
}

enum DesktopUpdateStatus: Equatable, Sendable {
    case unknown
    case checking
    case upToDate
    case updateAvailable(DesktopUpdate)
}

/// Read-only check against the public GitHub releases list. A failed or
/// offline check maps to `.unknown` so the UI never invents update state.
struct DesktopUpdateChecker: Sendable {
    static let defaultReleasesURL = URL(
        string: "https://api.github.com/repos/steventsao/okrapdf-desktop/releases?per_page=10"
    )!

    private static let tagPrefix = "desktop-v"

    let releasesURL: URL
    private let fetch: @Sendable (URL) async throws -> Data

    init(
        releasesURL: URL = DesktopUpdateChecker.defaultReleasesURL,
        fetch: @escaping @Sendable (URL) async throws -> Data = DesktopUpdateChecker.fetchReleases
    ) {
        self.releasesURL = releasesURL
        self.fetch = fetch
    }

    func check(currentVersion: String) async -> DesktopUpdateStatus {
        guard let current = DesktopVersion(currentVersion) else { return .unknown }
        do {
            let data = try await fetch(releasesURL)
            guard let latest = latestRelease(from: data) else { return .unknown }
            return latest.version > current
                ? .updateAvailable(latest)
                : .upToDate
        } catch {
            return .unknown
        }
    }

    /// Newest non-draft `desktop-v*` release in a GitHub releases API payload.
    func latestRelease(from data: Data) -> DesktopUpdate? {
        guard let entries = try? JSONDecoder().decode([GitHubRelease].self, from: data) else {
            return nil
        }
        return entries
            .filter { $0.draft == false && $0.tagName.hasPrefix(Self.tagPrefix) }
            .compactMap { entry -> DesktopUpdate? in
                let versionString = String(entry.tagName.dropFirst(Self.tagPrefix.count))
                guard let version = DesktopVersion(versionString),
                      let url = URL(string: entry.htmlURL) else {
                    return nil
                }
                return DesktopUpdate(
                    version: version,
                    versionString: versionString,
                    tag: entry.tagName,
                    url: url
                )
            }
            .max { $0.version < $1.version }
    }

    private static let fetchReleases: @Sendable (URL) async throws -> Data = { url in
        var request = URLRequest(url: url, timeoutInterval: 10)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("okrapdf-desktop", forHTTPHeaderField: "User-Agent")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        return data
    }

    private struct GitHubRelease: Decodable {
        let tagName: String
        let htmlURL: String
        let draft: Bool

        enum CodingKeys: String, CodingKey {
            case tagName = "tag_name"
            case htmlURL = "html_url"
            case draft
        }
    }
}
