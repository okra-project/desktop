import Foundation

extension LocalProviderSetupPhase {
    var title: String {
        switch self {
        case .preparing:
            "Preparing"
        case .installingRuntime:
            "Installing runtime"
        case .downloadingModel:
            "Downloading model"
        case .verifying:
            "Verifying model"
        case .ready:
            "Ready offline"
        }
    }
}
