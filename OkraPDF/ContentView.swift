import Foundation
import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @EnvironmentObject private var state: AppState
    @State private var isDropTargeted = false

    var body: some View {
        VStack(spacing: 0) {
            panelHeader

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    dropTarget

                    if let importError = state.importError {
                        Label(importError, systemImage: "exclamationmark.triangle")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    LocalExtractionView(
                        document: state.selectedDocument,
                        coordinator: state.localProcessing,
                        revealPDF: state.revealSelectedPDF
                    )
                }
                .padding()
            }

            Divider()

            panelFooter
        }
        .background(.background)
        .onDrop(
            of: [UTType.fileURL.identifier],
            isTargeted: $isDropTargeted,
            perform: handleDrop
        )
    }

    private var panelHeader: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text("okraPDF")
                    .font(.headline)
                Text("Private, on-device PDF extraction")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button("Open PDF…", action: state.openPDFPicker)
                .buttonStyle(.borderedProminent)
                .keyboardShortcut("o", modifiers: .command)
        }
        .padding()
    }

    private var dropTarget: some View {
        Button(action: state.openPDFPicker) {
            VStack(spacing: 6) {
                if let document = state.selectedDocument {
                    Text(document.fileName)
                        .font(.headline)
                        .lineLimit(1)
                    Text(document.totalPages == 1 ? "1 page · Drop another PDF" : "\(document.totalPages) pages · Drop another PDF")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                } else {
                    Text("Drop a PDF to extract")
                        .font(.headline)
                    Text("or click to choose a file")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 76)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .padding(8)
        .background(isDropTargeted ? Color.accentColor.opacity(0.12) : Color.secondary.opacity(0.06))
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(
                    isDropTargeted ? Color.accentColor : Color.secondary.opacity(0.35),
                    style: StrokeStyle(lineWidth: isDropTargeted ? 2 : 1, dash: [6])
                )
        }
        .clipShape(.rect(cornerRadius: 10))
        .accessibilityHint("Opens a PDF chooser. You can also drop a PDF here.")
    }

    private var panelFooter: some View {
        HStack {
            Button("Show Results", action: state.localProcessing.revealRunsFolder)
                .buttonStyle(.plain)
            Spacer()
            Text("Nothing is uploaded")
                .font(.caption)
                .foregroundStyle(.secondary)
            Button("Quit", action: state.quit)
                .buttonStyle(.plain)
                .keyboardShortcut("q", modifiers: .command)
        }
        .font(.caption)
        .padding(.horizontal)
        .padding(.vertical, 10)
    }

    private func handleDrop(providers: [NSItemProvider]) -> Bool {
        guard let provider = providers.first(where: {
            $0.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier)
        }) else {
            return false
        }

        if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
            provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
                guard let url = droppedFileURL(from: item) else { return }
                Task { @MainActor in
                    state.openAndExtract(url)
                }
            }
            return true
        }
        return false
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
