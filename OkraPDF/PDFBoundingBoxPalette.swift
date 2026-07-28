import AppKit

enum PDFBoundingBoxPalette {
    static func color(for label: String) -> NSColor {
        switch label {
        case "Table":
            return .systemBlue
        case "Picture":
            return .systemPurple
        case "Title", "Section-header":
            return .systemRed
        case "Page-header", "Page-footer":
            return .systemBrown
        case "List-item":
            return .systemGreen
        case "Text", "Caption", "Formula":
            return .secondaryLabelColor
        default:
            return .tertiaryLabelColor
        }
    }
}
