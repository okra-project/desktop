import SwiftUI

struct LocalExtractionView: View {
    let document: LocalPDFDocument?
    @ObservedObject var coordinator: LocalProcessingCoordinator
    let revealPDF: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            providerPicker
            providerStatus

            if let document {
                extractionStatus(for: document)
                primaryAction(for: document)
            }

            if !coordinator.outputText.isEmpty {
                output
            }
        }
    }

    private var providerPicker: some View {
        Menu {
            ForEach(coordinator.descriptors) { descriptor in
                Button {
                    coordinator.selectedProviderID = descriptor.id
                } label: {
                    let availability = coordinator.availabilityByProvider[descriptor.id]?.message ?? "Unavailable"
                    if descriptor.id == coordinator.selectedProviderID {
                        Label("\(descriptor.name) · \(availability)", systemImage: "checkmark")
                    } else {
                        Text("\(descriptor.name) · \(availability)")
                    }
                }
            }
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Local parser")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(coordinator.selectedDescriptor.name)
                        .font(.callout)
                        .bold()
                }
                Spacer()
                Text(coordinator.selectedAvailability.message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
            }
            .padding(10)
            .background(.quaternary.opacity(0.3))
            .clipShape(.rect(cornerRadius: 8))
        }
        .menuStyle(.borderlessButton)
        .disabled(coordinator.isRunning || coordinator.isInstalling)
        .accessibilityLabel("Local extraction model")
        .accessibilityValue("\(coordinator.selectedDescriptor.name), \(coordinator.selectedAvailability.message)")
    }

    private var providerStatus: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(
                coordinator.selectedAvailability.message,
                systemImage: coordinator.selectedAvailability.isReady ? "checkmark.circle" : "arrow.down.circle"
            )
            .font(.callout)
            .bold()

            Text(coordinator.selectedDescriptor.summary)
                .font(.caption)
                .foregroundStyle(.secondary)

            if let setupNote = coordinator.selectedDescriptor.setupNote {
                Text(setupNote)
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
    }

    @ViewBuilder
    private func extractionStatus(for document: LocalPDFDocument) -> some View {
        Divider()

        HStack {
            Text(coordinator.statusMessage)
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            Button("Show PDF", action: revealPDF)
                .buttonStyle(.plain)
                .font(.caption)
                .accessibilityLabel("Reveal \(document.fileName) in Finder")
        }

        if coordinator.isInstalling {
            ProgressView()
                .controlSize(.small)
                .accessibilityLabel(coordinator.statusMessage)
        } else if coordinator.isRunning {
            ProgressView(value: coordinator.progress)
                .controlSize(.small)
                .accessibilityLabel(coordinator.statusMessage)
        }
    }

    @ViewBuilder
    private func primaryAction(for document: LocalPDFDocument) -> some View {
        if coordinator.selectedAvailability.isReady {
            Button {
                coordinator.run(document: document)
            } label: {
                Text(coordinator.isRunning ? "Extracting…" : "Extract with \(coordinator.selectedDescriptor.name)")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(coordinator.isRunning || coordinator.isInstalling)
            .accessibilityHint("Extracts on this Mac without uploading the PDF")
        } else {
            Button(action: coordinator.installSelectedProvider) {
                Text(coordinator.isInstalling ? "Setting up…" : "Set up \(coordinator.selectedDescriptor.name)")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(coordinator.isRunning || coordinator.isInstalling)
            .accessibilityHint("Downloads this provider once for future offline extraction")
        }
    }

    private var output: some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()

            HStack {
                Text("Extracted Markdown")
                    .font(.callout)
                    .bold()
                Spacer()
                Button("Copy", action: coordinator.copyOutput)
                    .buttonStyle(.plain)
                Button("Save As…", action: coordinator.saveOutputAs)
                    .buttonStyle(.plain)
                Button("Reveal", action: coordinator.revealOutput)
                    .buttonStyle(.plain)
            }
            .font(.caption)

            ScrollView {
                Text(coordinator.outputText)
                    .font(.system(.caption, design: .monospaced))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(10)
            }
            .frame(minHeight: 150, maxHeight: 220)
            .background(.quaternary.opacity(0.2))
            .clipShape(.rect(cornerRadius: 8))
        }
    }
}
