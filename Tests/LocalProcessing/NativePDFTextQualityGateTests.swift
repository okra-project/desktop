import Foundation
import Testing
@testable import Okra

struct NativePDFTextQualityGateTests {
    private let gate = NativePDFTextQualityGate()
    private let letterPageArea = 612.0 * 792.0

    @Test("Plausible native text passes unchanged")
    func plausibleTextPasses() {
        let text = "A complete native paragraph with ordinary punctuation, numbers 123, and readable words."

        #expect(gate.evaluate(text: text, pageArea: letterPageArea) == .accepted)
    }

    @Test("Missing and short text fail on a non-trivial page")
    func missingAndShortTextFail() {
        #expect(gate.evaluate(text: nil, pageArea: letterPageArea) == .rejected(.missingText))
        #expect(gate.evaluate(text: "Page 1", pageArea: letterPageArea) == .rejected(.shortText))
    }

    @Test("Replacement characters and non-printable controls fail at a high ratio")
    func garbageEncodingFails() {
        let text = "Readable prefix " + String(repeating: "\u{FFFD}\u{0001}", count: 12)

        #expect(gate.evaluate(text: text, pageArea: letterPageArea) == .rejected(.garbageEncoding))
    }

    @Test("A repeated long extraction run fails deterministically")
    func duplicatedRunFails() {
        let repeatedRun = "This long broken text-layer run repeats every extracted word in exactly the same order. "
        let text = repeatedRun + repeatedRun

        #expect(gate.evaluate(text: text, pageArea: letterPageArea) == .rejected(.duplicatedRun))
        #expect(gate.evaluate(text: text, pageArea: letterPageArea) == .rejected(.duplicatedRun))
    }
}
