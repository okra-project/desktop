import Foundation

final class PresidioNERPlugin: LocalPluginRuntime, @unchecked Sendable {
    private struct RuntimeManifest: Decodable {
        let plugin: String
        let presidioVersion: String
        let spacyVersion: String
        let model: String
        let modelVersion: String
        let runtimeNetwork: Bool
    }

    static let defaultEntities = [
        "PERSON",
        "LOCATION",
        "NRP",
        "ORGANIZATION",
        "DATE_TIME",
        "EMAIL_ADDRESS",
        "PHONE_NUMBER",
        "US_SSN",
        "CREDIT_CARD",
        "IBAN_CODE",
        "IP_ADDRESS",
        "MEDICAL_LICENSE",
        "US_DRIVER_LICENSE",
        "US_PASSPORT",
    ]

    let definition = LocalPluginDefinition(
        id: .presidioNER,
        name: "Presidio NER",
        publisher: "Data Privacy Stack",
        version: "2.2.363",
        category: .privacy,
        summary: "Detect names, locations, identifiers, and other PII in completed local extractions.",
        setupNote: "One-time Python and English NLP model download. Detection is forced offline afterward.",
        homepage: URL(string: "https://github.com/data-privacy-stack/presidio")!,
        license: "MIT",
        permissions: LocalPluginPermissions(
            setupRequiresNetwork: true,
            runtimeAllowsNetwork: false,
            readsExtractedText: true,
            writesInsideRunDirectory: true
        ),
        operations: [
            LocalPluginOperationDefinition(
                id: "detect",
                name: "Detect PII",
                summary: "Return typed text spans and retain page boxes when the parser supplied them."
            ),
        ]
    )

    private let rootURL: URL
    private let pythonURL: URL
    private let readyMarkerURL: URL
    private let environment: [String: String]

    init(
        rootURL: URL = LocalPluginPaths.presidioRoot,
        pythonURL: URL = LocalPluginPaths.presidioPython,
        readyMarkerURL: URL = LocalPluginPaths.presidioReadyMarker,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) {
        self.rootURL = rootURL
        self.pythonURL = pythonURL
        self.readyMarkerURL = readyMarkerURL
        self.environment = environment
    }

    func availability() -> LocalPluginAvailability {
        if environment["OKRA_DESKTOP_SIMULATE_PRESIDIO"] == "1" {
            return .simulated("Simulation ready · Presidio is not loaded")
        }
        let fileManager = FileManager.default
        guard fileManager.fileExists(atPath: readyMarkerURL.path),
              fileManager.isExecutableFile(atPath: pythonURL.path) else {
            return .setupRequired("Setup required")
        }
        let manifestURL = rootURL.appendingPathComponent("runtime.json")
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        guard let data = try? Data(contentsOf: manifestURL),
              let manifest = try? decoder.decode(RuntimeManifest.self, from: data),
              manifest.plugin == definition.id.rawValue,
              manifest.presidioVersion == definition.version,
              manifest.spacyVersion == "3.8.14",
              manifest.model == "en_core_web_lg",
              manifest.modelVersion == "3.8.0",
              manifest.runtimeNetwork == false else {
            return .setupRequired("Update required")
        }
        return .ready
    }

    func install(progress: @escaping @Sendable (LocalPluginSetupProgress) -> Void) async throws {
        guard let scriptURL = LocalPluginResources.scriptURL(
            named: "install-presidio-ner",
            extension: "sh"
        ) else {
            throw LocalPluginError.missingResource("Presidio installer")
        }
        progress(
            LocalPluginSetupProgress(
                fraction: nil,
                message: "Installing Presidio and its English NLP model…"
            )
        )
        _ = try await LocalCommandRunner.runAsync(
            executableURL: URL(fileURLWithPath: "/bin/zsh"),
            arguments: [scriptURL.path, rootURL.path]
        )
        progress(LocalPluginSetupProgress(fraction: 1, message: "Presidio NER is ready offline."))
    }

    func invoke(
        invocation: LocalPluginInvocation,
        progress: @escaping LocalPluginProgress
    ) async throws -> URL {
        let availability = availability()
        guard availability.isReady else {
            throw LocalPluginError.pluginUnavailable("Set up Presidio NER before detecting PII.")
        }
        guard let workerURL = LocalPluginResources.scriptURL(
            named: "presidio-ner-worker",
            extension: "py"
        ) else {
            throw LocalPluginError.missingResource("Presidio worker")
        }

        let request = try PresidioDetectionRequest.build(
            sourceOutputURL: invocation.sourceOutputURL,
            structuredOutputURL: invocation.structuredOutputURL,
            entities: Self.defaultEntities,
            minScore: 0.35
        )
        try FileManager.default.createDirectory(
            at: invocation.outputDirectory,
            withIntermediateDirectories: true
        )
        let requestURL = invocation.outputDirectory.appendingPathComponent("request.json")
        let resultURL = invocation.outputDirectory.appendingPathComponent("result.json")
        if FileManager.default.fileExists(atPath: resultURL.path) {
            try FileManager.default.removeItem(at: resultURL)
        }
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(request).write(to: requestURL, options: .atomic)

        progress(nil, "Presidio is analyzing extracted text offline…")
        var arguments = [workerURL.path, "--input", requestURL.path, "--output", resultURL.path]
        if availability.isSimulated {
            arguments.append("--simulate")
        }
        _ = try await LocalCommandRunner.runAsync(
            executableURL: availability.isSimulated
                ? Self.systemPythonURL()
                : pythonURL,
            arguments: arguments,
            environment: [
                "HF_HUB_OFFLINE": "1",
                "TRANSFORMERS_OFFLINE": "1",
                "TOKENIZERS_PARALLELISM": "false",
            ]
        )
        _ = try PresidioDetectionResult.load(from: resultURL)
        progress(1, "PII detection complete.")
        return resultURL
    }

    private static func systemPythonURL() -> URL {
        let candidates = [
            "/opt/homebrew/bin/python3.13",
            "/opt/homebrew/bin/python3.12",
            "/opt/homebrew/bin/python3",
            "/usr/local/bin/python3",
            "/usr/bin/python3",
        ]
        return URL(fileURLWithPath: candidates.first {
            FileManager.default.isExecutableFile(atPath: $0)
        } ?? "/usr/bin/python3")
    }
}
