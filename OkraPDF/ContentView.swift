import Foundation
import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @EnvironmentObject private var state: AppState
    @State private var isDropTargeted = false

    var body: some View {
        VStack(spacing: 0) {
            toolbar
            Divider()

            HSplitView {
                documentPane
                    .frame(minWidth: 480, maxWidth: .infinity, maxHeight: .infinity)

                parserInspector
                    .frame(minWidth: 280, idealWidth: 320, maxWidth: 360, maxHeight: .infinity)
            }
        }
        .frame(minWidth: 780, minHeight: 520)
        .onDrop(
            of: [UTType.fileURL.identifier],
            isTargeted: $isDropTargeted,
            perform: handleDrop
        )
        .onOpenURL { url in
            state.openPDF(url)
        }
    }

    private var toolbar: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text(state.selectedDocument?.fileName ?? "okraPDF")
                    .font(.headline)
                    .lineLimit(1)

                if let document = state.selectedDocument {
                    Text(pageCountLabel(for: document.totalPages))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text("Local PDF reader and parser")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            Button("Open PDF…", action: state.openPDFPicker)
                .keyboardShortcut("o", modifiers: .command)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    @ViewBuilder
    private var documentPane: some View {
        ZStack {
            if let pdfDocument = state.pdfDocument {
                PDFReaderView(document: pdfDocument)
            } else {
                VStack(spacing: 10) {
                    Text("Open a PDF")
                        .font(.title2.weight(.semibold))
                    Text("Read it first. Parse it only when you choose.")
                        .foregroundStyle(.secondary)
                    Button("Choose PDF…", action: state.openPDFPicker)
                        .buttonStyle(.borderedProminent)
                }
                .padding(32)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(nsColor: .underPageBackgroundColor))
            }

            if isDropTargeted {
                ZStack {
                    Color.accentColor.opacity(0.12)
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(Color.accentColor, lineWidth: 2)
                        .padding(12)
                    Text("Drop PDF to open")
                        .font(.headline)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
                }
                .allowsHitTesting(false)
            }
        }
    }

    private var parserInspector: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Parse")
                        .font(.title3.weight(.semibold))
                    Text("Choose a local parser, then start it when you are ready.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if let importError = state.importError {
                    Text(importError)
                        .font(.callout)
                        .foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityLabel("Error: \(importError)")
                }

                LocalExtractionView(
                    document: state.selectedDocument,
                    coordinator: state.localProcessing,
                    parse: state.parseSelectedDocument,
                    revealPDF: state.revealSelectedPDF
                )
            }
            .padding(16)
        }
        .background(.regularMaterial)
    }

    private func pageCountLabel(for count: Int) -> String {
        count == 1 ? "1 page" : "\(count) pages"
    }

    private func handleDrop(providers: [NSItemProvider]) -> Bool {
        guard let provider = providers.first(where: {
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
