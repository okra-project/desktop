import Foundation

enum ExtractionOutputMode: String, CaseIterable, Identifiable {
    case preview = "Preview"
    case markdown = "Markdown"
    case json = "JSON"

    var id: String { rawValue }
}
