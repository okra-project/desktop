import Foundation

protocol UnlimitedOCRModelInstalling: Sendable {
    func install(
        runtime: UnlimitedOCRRuntime,
        scriptURL: URL,
        progress: @escaping @Sendable (LocalProviderSetupProgress) -> Void
    ) async throws
}
