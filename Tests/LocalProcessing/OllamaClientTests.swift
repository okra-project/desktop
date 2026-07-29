import Foundation
import Testing
@testable import Okra

struct OllamaClientTests {
    @Test("Model discovery uses native Ollama HTTP APIs and filters by capabilities")
    func modelDiscovery() async throws {
        let recorder = OllamaRequestRecorder { request in
            switch request.url?.path {
            case "/api/tags":
                return #"{"models":[{"name":"text:latest","model":"text:latest","size":10,"digest":"a","details":{"family":"qwen","parameter_size":"3B","quantization_level":"Q4"}},{"name":"vision:latest","model":"vision:latest","size":20,"digest":"b","details":{"family":"qwen","parameter_size":"7B","quantization_level":"Q4"}}]}"#
            case "/api/show":
                let body = try #require(request.httpBody)
                let model = try JSONDecoder().decode(ShowBody.self, from: body).model
                return model == "vision:latest"
                    ? #"{"capabilities":["completion","vision"],"details":{"family":"qwen"}}"#
                    : #"{"capabilities":["completion"],"details":{"family":"qwen"}}"#
            default:
                Issue.record("Unexpected Ollama path: \(request.url?.path ?? "nil")")
                return #"{}"#
            }
        }
        let models = try await recorder.client.listModels()

        #expect(models.map(\.name) == ["text:latest", "vision:latest"])
        #expect(models.filter(\.supportsVision).map(\.name) == ["vision:latest"])
        #expect(recorder.requests.map { $0.url?.path } == ["/api/tags", "/api/show", "/api/show"])
        #expect(recorder.requests.first?.httpMethod == "GET")
    }

    @Test("Page extraction uses native chat with a base64 image")
    func visionChat() async throws {
        let recorder = OllamaRequestRecorder { request in
            #"{"message":{"role":"assistant","content":"```markdown\n# Invoice\n\nTotal: $42\n```","images":null}}"#
        }
        let imageURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("ollama-client-\(UUID().uuidString).png")
        try Data([0x89, 0x50, 0x4E, 0x47]).write(to: imageURL)
        defer { try? FileManager.default.removeItem(at: imageURL) }

        let markdown = try await recorder.client.extractMarkdown(
            model: "vision:latest",
            imageURL: imageURL
        )

        let request = try #require(recorder.requests.first)
        let body = try #require(request.httpBody)
        let json = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
        let messages = try #require(json["messages"] as? [[String: Any]])
        let images = try #require(messages.first?["images"] as? [String])
        #expect(request.url?.path == "/api/chat")
        #expect(json["model"] as? String == "vision:latest")
        #expect(json["stream"] as? Bool == false)
        #expect(images == [Data([0x89, 0x50, 0x4E, 0x47]).base64EncodedString()])
        #expect(markdown == "# Invoice\n\nTotal: $42")
    }

    private struct ShowBody: Decodable {
        let model: String
    }
}

private final class OllamaRequestRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var recordedRequests: [URLRequest] = []
    private let response: @Sendable (URLRequest) throws -> String

    init(response: @escaping @Sendable (URLRequest) throws -> String) {
        self.response = response
    }

    var requests: [URLRequest] {
        lock.withLock { recordedRequests }
    }

    var client: OllamaClient {
        OllamaClient(
            transport: OllamaHTTPTransport { [weak self] request in
                guard let self else { throw CancellationError() }
                self.lock.withLock { self.recordedRequests.append(request) }
                let data = try Data(self.response(request).utf8)
                let response = HTTPURLResponse(
                    url: try #require(request.url),
                    statusCode: 200,
                    httpVersion: nil,
                    headerFields: ["Content-Type": "application/json"]
                )!
                return (data, response)
            }
        )
    }
}
