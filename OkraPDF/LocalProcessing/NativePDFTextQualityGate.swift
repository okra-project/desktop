import Foundation

enum NativePDFTextQualityRejection: Equatable, Sendable {
    case missingText
    case shortText
    case garbageEncoding
    case duplicatedRun
}

enum NativePDFTextQualityDecision: Equatable, Sendable {
    case accepted
    case rejected(NativePDFTextQualityRejection)
}

struct NativePDFTextQualityGate: Sendable {
    let minimumCharacterCount: Int
    let minimumNonTrivialPageArea: Double
    let maximumGarbageRatio: Double
    let minimumDuplicatedRunLength: Int

    init(
        minimumCharacterCount: Int = 24,
        minimumNonTrivialPageArea: Double = 100_000,
        maximumGarbageRatio: Double = 0.10,
        minimumDuplicatedRunLength: Int = 64
    ) {
        self.minimumCharacterCount = minimumCharacterCount
        self.minimumNonTrivialPageArea = minimumNonTrivialPageArea
        self.maximumGarbageRatio = maximumGarbageRatio
        self.minimumDuplicatedRunLength = minimumDuplicatedRunLength
    }

    func evaluate(text: String?, pageArea: Double) -> NativePDFTextQualityDecision {
        guard let text else { return .rejected(.missingText) }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.isEmpty == false else { return .rejected(.missingText) }

        if hasGarbageEncoding(text) {
            return .rejected(.garbageEncoding)
        }
        if hasDuplicatedRun(text) {
            return .rejected(.duplicatedRun)
        }

        let visibleCharacterCount = text.reduce(into: 0) { count, character in
            if character.isWhitespace == false {
                count += 1
            }
        }
        if pageArea >= minimumNonTrivialPageArea,
           visibleCharacterCount < minimumCharacterCount {
            return .rejected(.shortText)
        }
        return .accepted
    }

    private func hasGarbageEncoding(_ text: String) -> Bool {
        let scalars = text.unicodeScalars
        guard scalars.isEmpty == false else { return false }
        let garbageCount = scalars.reduce(into: 0) { count, scalar in
            let isAllowedControl = scalar == "\n" || scalar == "\r" || scalar == "\t"
            if scalar.value == 0xFFFD
                || (CharacterSet.controlCharacters.contains(scalar) && isAllowedControl == false) {
                count += 1
            }
        }
        guard garbageCount >= 3 else { return false }
        return Double(garbageCount) / Double(scalars.count) >= maximumGarbageRatio
    }

    private func hasDuplicatedRun(_ text: String) -> Bool {
        let runs = text
            .components(separatedBy: CharacterSet(charactersIn: ".!?\n"))
            .map(Self.collapseWhitespace)
            .filter { $0.isEmpty == false }

        if runs.count >= 2 {
            for index in 1..<runs.count
            where runs[index].count >= minimumDuplicatedRunLength
                && runs[index] == runs[index - 1] {
                return true
            }
        }

        let collapsed = Self.collapseWhitespace(text)
        guard collapsed.count >= minimumDuplicatedRunLength * 2 else { return false }
        let characters = Array(collapsed)
        var prefixLengths = Array(repeating: 0, count: characters.count)
        for index in 1..<characters.count {
            var candidate = prefixLengths[index - 1]
            while candidate > 0, characters[index] != characters[candidate] {
                candidate = prefixLengths[candidate - 1]
            }
            if characters[index] == characters[candidate] {
                candidate += 1
            }
            prefixLengths[index] = candidate
        }
        let period = characters.count - prefixLengths[characters.count - 1]
        return period >= minimumDuplicatedRunLength
            && characters.count.isMultiple(of: period)
            && characters.count / period >= 2
    }

    private static func collapseWhitespace(_ text: String) -> String {
        text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }
}
