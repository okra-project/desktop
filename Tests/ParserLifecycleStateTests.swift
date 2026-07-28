import Foundation
import Testing
@testable import Okra

@Suite("Parser lifecycle state")
struct ParserLifecycleStateTests {
    @Test("Canonical parser states keep their durable wire names")
    func canonicalWireNames() {
        #expect(
            ParserLifecycleState.allCases.map(\.rawValue)
                == ["idle", "inProgress", "done", "attention", "error"]
        )
    }

    @Test("Terminal output cannot regress while attention and errors can retry")
    func transitionRules() {
        #expect(ParserLifecycleState.idle.canTransition(to: .inProgress))
        #expect(ParserLifecycleState.idle.canTransition(to: .done))
        #expect(ParserLifecycleState.inProgress.canTransition(to: .done))
        #expect(ParserLifecycleState.inProgress.canTransition(to: .attention))
        #expect(ParserLifecycleState.inProgress.canTransition(to: .error))
        #expect(ParserLifecycleState.attention.canTransition(to: .inProgress))
        #expect(ParserLifecycleState.error.canTransition(to: .inProgress))
        #expect(ParserLifecycleState.done.canTransition(to: .done))
        #expect(ParserLifecycleState.done.canTransition(to: .inProgress) == false)
    }

    @Test("Parser and page identity prevent cross-provider collisions")
    func parserPageIdentity() {
        let timestamp = Date(timeIntervalSince1970: 1_700_000_000)
        let apple = ParserPageLifecycle(
            parserID: "apple-vision",
            pageNumber: 2,
            state: .idle,
            detail: nil,
            updatedAt: timestamp
        )
        let baidu = ParserPageLifecycle(
            parserID: "unlimited-ocr",
            pageNumber: 2,
            state: .idle,
            detail: nil,
            updatedAt: timestamp
        )

        #expect(apple.id != baidu.id)
        #expect(apple.pageNumber == baidu.pageNumber)
    }

    @Test("Lifecycle transition updates only the addressed entry")
    func isolatedTransition() {
        let initial = Date(timeIntervalSince1970: 1_700_000_000)
        let updated = initial.addingTimeInterval(5)
        var apple = ParserPageLifecycle(
            parserID: "apple-vision",
            pageNumber: 1,
            state: .idle,
            detail: nil,
            updatedAt: initial
        )
        let baidu = ParserPageLifecycle(
            parserID: "unlimited-ocr",
            pageNumber: 1,
            state: .idle,
            detail: nil,
            updatedAt: initial
        )

        let changed = apple.transition(to: .inProgress, detail: "Reading", at: updated)
        #expect(changed)
        #expect(apple.state == .inProgress)
        #expect(apple.detail == "Reading")
        #expect(apple.updatedAt == updated)
        #expect(baidu.state == .idle)
    }

    @Test("Lifecycle entries round-trip through durable JSON")
    func codableRoundTrip() throws {
        let entries = ParserPageLifecycle.idlePages(
            parserID: "apple-vision",
            pageCount: 3,
            at: Date(timeIntervalSince1970: 1_700_000_000)
        )
        let data = try JSONEncoder().encode(entries)
        let decoded = try JSONDecoder().decode([ParserPageLifecycle].self, from: data)

        #expect(decoded == entries)
    }

    @Test("A second parser receives an isolated page matrix")
    func parserMatrixIsolation() {
        let timestamp = Date(timeIntervalSince1970: 1_700_000_000)
        var entries = ParserPageLifecycle.idlePages(
            parserID: "apple-vision",
            pageCount: 2,
            at: timestamp
        )

        entries = ParserPageLifecycle.applying(
            parserID: "unlimited-ocr",
            pageNumber: 2,
            state: .inProgress,
            totalPageCount: 2,
            detail: "Reading with Baidu",
            at: timestamp.addingTimeInterval(1),
            to: entries
        )

        #expect(entries.count == 4)
        #expect(entries.filter { $0.parserID == "apple-vision" }.allSatisfy { $0.state == .idle })
        #expect(
            entries.first { $0.parserID == "unlimited-ocr" && $0.pageNumber == 1 }?.state
                == .idle
        )
        #expect(
            entries.first { $0.parserID == "unlimited-ocr" && $0.pageNumber == 2 }?.state
                == .inProgress
        )
    }

    @Test("Rollup prioritizes human attention without hiding errors or active work")
    func rollupPriority() {
        #expect(ParserLifecycleState.rollup([]) == .idle)
        #expect(ParserLifecycleState.rollup([.done, .done]) == .done)
        #expect(ParserLifecycleState.rollup([.idle, .inProgress]) == .inProgress)
        #expect(ParserLifecycleState.rollup([.inProgress, .error]) == .error)
        #expect(ParserLifecycleState.rollup([.error, .attention]) == .attention)
    }

    @Test("Every canonical state has distinct visible and accessible presentation")
    func presentationCoverage() {
        let presentations = ParserLifecycleState.allCases.map(\.presentation)

        #expect(Set(presentations.map(\.title)).count == ParserLifecycleState.allCases.count)
        #expect(Set(presentations.map(\.systemImage)).count == ParserLifecycleState.allCases.count)
        #expect(presentations.allSatisfy { $0.accessibilityDescription.isEmpty == false })
    }

    @Test("Legacy run manifests decode without page lifecycle data")
    func legacyRunCompatibility() throws {
        let json = """
        {
          "id": "legacy-run",
          "sourcePath": "/tmp/legacy.pdf",
          "fileName": "legacy.pdf",
          "providerId": "apple-vision",
          "providerName": "Apple Vision",
          "status": "succeeded",
          "pageCount": 1,
          "startedAt": "2026-07-28T12:00:00Z"
        }
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let run = try decoder.decode(LocalProcessingRun.self, from: Data(json.utf8))

        #expect(run.pageLifecycles == nil)
    }
}
