import Foundation
import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @EnvironmentObject private var state: AppState
    @State private var isDropTargeted = false

    var body: some View {
        VStack(spacing: 0) {
            appHeader
            Divider()

            HSplitView {
                documentPane
                    .frame(minWidth: 620)

                inspectorPane
                    .frame(minWidth: 320, idealWidth: 360, maxWidth: 420)
            }

            Divider()
            appFooter
        }
        .background(.background)
        .onDrop(
            of: [UTType.fileURL.identifier],
            isTargeted: $isDropTargeted,
            perform: handleDrop
        )
    }

    private var appHeader: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 2) {
                Text("okraPDF")
                    .font(.headline)
                Text("Private PDF reading and extraction")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if let document = state.selectedDocument {
                VStack(alignment: .trailing, spacing: 2) {
                    Text(document.fileName)
                        .font(.callout)
                        .lineLimit(1)
                    Text(pageCountLabel(document.totalPages))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Button("Open PDF…", action: state.openPDFPicker)
                .buttonStyle(.bordered)
                .keyboardShortcut("o", modifiers: .command)
                .disabled(state.localProcessing.isRunning || state.localProcessing.isInstalling)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
    }

    @ViewBuilder
    private var documentPane: some View {
        if let document = state.selectedDocument {
            ZStack {
                PDFDocumentView(url: document.fileURL)
                if isDropTargeted {
                    RoundedRectangle(cornerRadius: 14)
                        .fill(.tint.opacity(0.12))
                        .overlay {
                            Text("Drop to open this PDF")
                                .font(.title3.weight(.semibold))
                                .foregroundStyle(.tint)
                        }
                        .padding(24)
                }
            }
            .accessibilityLabel("PDF preview for \(document.fileName)")
        } else {
            emptyDocumentPane
        }
    }

    private var emptyDocumentPane: some View {
        Button(action: state.openPDFPicker) {
            VStack(spacing: 12) {
                Text("PDF")
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundStyle(.tint)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .background(.tint.opacity(0.1), in: RoundedRectangle(cornerRadius: 9))

                Text("Open a PDF to read and parse")
                    .font(.title3.weight(.semibold))
                Text("Drop a file anywhere in this window, or click to choose one.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                Text("The original stays exactly where it is.")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .background(.quaternary.opacity(0.12))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(
                    isDropTargeted ? Color.accentColor : Color.secondary.opacity(0.35),
                    style: StrokeStyle(lineWidth: isDropTargeted ? 2 : 1, dash: [7])
                )
                .padding(28)
        }
        .accessibilityHint("Opens a PDF chooser. You can also drop a PDF anywhere in the window.")
    }

    private var inspectorPane: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Extract")
                    .font(.title3.weight(.semibold))

                Text("Choose a local parser, then start when you are ready. Opening a PDF never starts extraction.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                if let importError = state.importError {
                    Text(importError)
                        .font(.callout)
                        .foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
                }

                LocalExtractionView(
                    document: state.selectedDocument,
                    coordinator: state.localProcessing,
                    parse: state.parseSelectedDocument,
                    revealPDF: state.revealSelectedPDF
                )
            }
            .padding(18)
        }
        .background(.background)
    }

    private var appFooter: some View {
        HStack(spacing: 12) {
            Button("Show Runs", action: state.localProcessing.revealRunsFolder)
                .buttonStyle(.plain)

            Spacer()

            Text("On-device by default · Nothing is uploaded")
                .foregroundStyle(.secondary)

            Button("Quit", action: state.quit)
                .buttonStyle(.plain)
                .keyboardShortcut("q", modifiers: .command)
        }
        .font(.caption)
        .padding(.horizontal, 18)
        .padding(.vertical, 9)
    }

    private func pageCountLabel(_ count: Int) -> String {
        count == 1 ? "1 page" : "\(count) pages"
    }

    private func handleDrop(providers: [NSItemProvider]) -> Bool {
        guard !state.localProcessing.isRunning,
              !state.localProcessing.isInstalling,
              let provider = providers.first(where: {
                  $0.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier)
              }) else {
            return false
        }

        provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
            guard let url = droppedFileURL(from: item) else { return }
            Task { @MainActor in
                state.openPDF(url)
            }
        }
        return true
    }

    private func droppedFileURL(from item: NSSecureCoding?) -> URL? {
        if let url = item as? URL {
            return url.standardizedFileURL
        }

        if let data = item as? Data {
            if let url = try? NSKeyedUnarchiver.unarchivedObject(ofClass: NSURL.self, from: data) {
                return (url as URL).standardizedFileURL
            }
            if let string = String(data: data, encoding: .utf8) {
                return droppedFileURL(from: string as NSSecureCoding)
            }
        }

        if let string = item as? String {
            if let url = URL(string: string), url.isFileURL {
                return url.standardizedFileURL
            }
            return URL(fileURLWithPath: string).standardizedFileURL
        }

        return nil
    }
}
