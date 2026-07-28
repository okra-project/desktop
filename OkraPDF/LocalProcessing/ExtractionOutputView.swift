import SwiftUI

private enum ExtractionOutputMode: String, CaseIterable, Identifiable {
    case preview = "Preview"
    case markdown = "Markdown"
    case json = "JSON"

    var id: String { rawValue }
}

struct ExtractionOutputView: View {
    @ObservedObject var coordinator: LocalProcessingCoordinator
    @State private var mode: ExtractionOutputMode = .preview

    private var hasStructuredOutput: Bool {
        coordinator.structuredOutput != nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: WorkspaceTheme.standardSpacing) {
            Divider()
            header

            if hasStructuredOutput {
                Picker("Output format", selection: $mode) {
                    ForEach(ExtractionOutputMode.allCases) { option in
                        Text(option.rawValue).tag(option)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
            }

            ScrollView {
                outputContent
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(WorkspaceTheme.standardSpacing)
            }
            .frame(minHeight: 180, maxHeight: 360)
            .background(.quaternary.opacity(0.2), in: .rect(cornerRadius: WorkspaceTheme.cardRadius))
        }
    }

    private var header: some View {
        HStack {
            Text(hasStructuredOutput ? "Structured extraction" : "Extracted Markdown")
                .font(.headline)
            Spacer()
            Button("Copy", action: copyCurrentOutput)
                .buttonStyle(.plain)
            Button("Save…", action: saveCurrentOutput)
                .buttonStyle(.plain)
            Button("Reveal", action: revealCurrentOutput)
                .buttonStyle(.plain)
        }
    }

    @ViewBuilder
    private var outputContent: some View {
        if let document = coordinator.structuredOutput, mode == .preview {
            StructuredExtractionPreview(document: document)
        } else if hasStructuredOutput, mode == .json {
            Text(coordinator.structuredOutputText)
                .font(.system(.callout, design: .monospaced))
                .textSelection(.enabled)
        } else {
            Text(coordinator.outputText)
                .font(.system(.callout, design: .monospaced))
                .textSelection(.enabled)
        }
    }

    private func copyCurrentOutput() {
        if hasStructuredOutput, mode == .json {
            coordinator.copyStructuredOutput()
        } else {
            coordinator.copyOutput()
        }
    }

    private func saveCurrentOutput() {
        if hasStructuredOutput, mode == .json {
            coordinator.saveStructuredOutputAs()
        } else {
            coordinator.saveOutputAs()
        }
    }

    private func revealCurrentOutput() {
        if hasStructuredOutput, mode == .json {
            coordinator.revealStructuredOutput()
        } else {
            coordinator.revealOutput()
        }
    }
}

private struct StructuredExtractionPreview: View {
    let document: StructuredExtractionDocument

    var body: some View {
        LazyVStack(alignment: .leading, spacing: WorkspaceTheme.sectionSpacing) {
            ForEach(document.pages) { page in
                VStack(alignment: .leading, spacing: WorkspaceTheme.standardSpacing) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Page \(page.pageNumber)")
                            .font(.headline)
                        Spacer()
                        if page.diagnostics.duplicateBlockCount > 0 {
                            Text("\(page.diagnostics.duplicateBlockCount) repeats removed")
                                .font(.caption)
                                .foregroundStyle(.orange)
                        }
                    }

                    ForEach(page.blocks) { block in
                        StructuredExtractionBlockView(block: block)
                    }
                }

                if page.id != document.pages.last?.id {
                    Divider()
                }
            }
        }
        .textSelection(.enabled)
    }
}

private struct StructuredExtractionBlockView: View {
    let block: StructuredExtractionBlock

    var body: some View {
        VStack(alignment: .leading, spacing: WorkspaceTheme.compactSpacing) {
            HStack(alignment: .firstTextBaseline) {
                Text(block.type.replacingOccurrences(of: "-", with: " ").capitalized)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                if let bbox = block.bbox {
                    Text(bbox.compactLabel)
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.tertiary)
                }
            }

            blockText
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(WorkspaceTheme.compactSpacing)
        .background(.background.opacity(0.7), in: .rect(cornerRadius: WorkspaceTheme.cardRadius))
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
}
