import Foundation

protocol UnlimitedOCRModelDownloading: Sendable {
    func downloadModel(
        to modelURL: URL,
        progress: @escaping @Sendable (LocalProviderSetupProgress) -> Void
    ) async throws
}
