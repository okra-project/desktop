import Foundation

enum LocalProviderPaths {
    static var runsRoot: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("okraPDF", isDirectory: true)
            .appendingPathComponent("Runs", isDirectory: true)
    }

    static var providersRoot: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".okra", isDirectory: true)
            .appendingPathComponent("providers", isDirectory: true)
    }

    static var doclingRoot: URL {
        providersRoot.appendingPathComponent("docling", isDirectory: true)
    }

    static var doclingExecutable: URL {
        doclingRoot
            .appendingPathComponent("venv", isDirectory: true)
            .appendingPathComponent("bin", isDirectory: true)
            .appendingPathComponent("docling")
    }

    static var doclingModels: URL {
        doclingRoot.appendingPathComponent("models", isDirectory: true)
    }

    static var doclingReadyMarker: URL {
        doclingRoot.appendingPathComponent(".ready")
    }

    static var unlimitedOCRRoot: URL {
        providersRoot.appendingPathComponent("unlimited-ocr", isDirectory: true)
    }

    static var unlimitedOCRPython: URL {
        unlimitedOCRRoot
            .appendingPathComponent("venv", isDirectory: true)
            .appendingPathComponent("bin", isDirectory: true)
            .appendingPathComponent("python")
    }

    static var unlimitedOCRModel: URL {
        unlimitedOCRRoot.appendingPathComponent("model", isDirectory: true)
    }

    static var unlimitedOCRReadyMarker: URL {
        unlimitedOCRRoot.appendingPathComponent(".ready")
    }

    static func runDirectory(runsRoot: URL = runsRoot, runID: String) -> URL {
        runsRoot.appendingPathComponent(runID, isDirectory: true)
    }
}
