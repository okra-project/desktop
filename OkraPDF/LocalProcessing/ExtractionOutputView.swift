import Combine
import SwiftUI

struct ExtractionOutputView: View {
    @ObservedObject var coordinator: LocalProcessingCoordinator
    @State private var mode: ExtractionOutputMode = .preview
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

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

            Group {
                if let document = coordinator.structuredOutput, mode == .preview {
                    ScrollViewReader { proxy in
                        ScrollView {
                            StructuredExtractionPreview(
                                document: document,
                                selectedBlockID: coordinator.selectedStructuredBlockID,
                                hoveredBlockID: coordinator.hoveredStructuredBlockID,
                                selectBlock: coordinator.selectStructuredBlock,
                                hoverBlock: coordinator.hoverStructuredBlock
                            )
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(WorkspaceTheme.standardSpacing)
                        }
                        .onReceive(coordinator.$selectedStructuredBlockID.removeDuplicates()) { id in
                            scroll(to: id, using: proxy)
                        }
                        .onReceive(coordinator.$hoveredStructuredBlockID.removeDuplicates()) { id in
                            guard coordinator.structuredBlockHoverSource == .pdf else { return }
                            scroll(to: id, using: proxy)
                        }
                    }
                } else {
                    ScrollView {
                        Text(hasStructuredOutput && mode == .json
                             ? coordinator.structuredOutputText
                             : coordinator.outputText)
                            .font(.system(.callout, design: .monospaced))
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(WorkspaceTheme.standardSpacing)
                    }
                }
            }
            .frame(minHeight: 180, maxHeight: 360)
            .background(
                .quaternary.opacity(0.2),
                in: .rect(cornerRadius: WorkspaceTheme.cardRadius)
            )
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

    private func scroll(to id: String?, using proxy: ScrollViewProxy) {
        guard let id else { return }
        if reduceMotion {
            proxy.scrollTo(id, anchor: .center)
        } else {
            withAnimation(.easeInOut(duration: 0.2)) {
                proxy.scrollTo(id, anchor: .center)
            }
        }
    }
}
