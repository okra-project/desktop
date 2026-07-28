import SwiftUI

struct StructuredExtractionBlockView: View {
    let block: StructuredExtractionBlock
    let pageNumber: Int
    let isSelected: Bool
    let selectBlock: (String) -> Void

    var body: some View {
        Group {
            if hasSourceBox {
                Button(action: select) {
                    cardContent
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
            } else {
                cardContent
            }
        }
        .background(
            isSelected ? Color.primary.opacity(0.08) : Color(nsColor: .controlBackgroundColor),
            in: .rect(cornerRadius: WorkspaceTheme.cardRadius)
        )
        .overlay {
            RoundedRectangle(cornerRadius: WorkspaceTheme.cardRadius)
                .strokeBorder(
                    isSelected ? Color.primary.opacity(0.52) : Color.clear,
                    lineWidth: 2
                )
        }
        .accessibilityLabel("\(block.type) block on page \(pageNumber): \(block.displayText)")
        .accessibilityValue(accessibilityValue)
        .accessibilityHint(
            hasSourceBox
                ? "Shows and highlights this extraction box in the source PDF"
                : "No source box is available for this block"
        )
    }

    private var hasSourceBox: Bool {
        block.bbox?.clippedNormalizedRect != nil
    }

    private var accessibilityValue: String {
        guard hasSourceBox else { return "No source box" }
        return isSelected ? "Selected" : "Not selected"
    }

    private var cardContent: some View {
        VStack(alignment: .leading, spacing: WorkspaceTheme.compactSpacing) {
            HStack(alignment: .firstTextBaseline) {
                Text(block.type.replacing("-", with: " ").capitalized)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                if let bbox = block.bbox {
                    Text(bbox.compactLabel)
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.tertiary)
                }
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.primary)
                        .accessibilityHidden(true)
                }
            }

            blockText
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(WorkspaceTheme.compactSpacing)
    }

    @ViewBuilder
    private var blockText: some View {
        switch block.type {
        case "title":
            Text(block.displayText).font(.headline)
        case "heading", "header":
            Text(block.displayText).font(.subheadline.weight(.semibold))
        case "table", "equation":
            Text(block.displayText).font(.system(.caption, design: .monospaced))
        case "caption", "footer":
            Text(block.displayText).font(.caption).foregroundStyle(.secondary)
        default:
            Text(block.displayText).font(.callout)
        }
    }

    private func select() {
        selectBlock(block.id)
    }
}
