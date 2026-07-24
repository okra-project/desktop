import SwiftUI

struct LocalExtractionView: View {
    let document: LocalPDFDocument?
    @ObservedObject var coordinator: LocalProcessingCoordinator
    let parse: () -> Void
    let revealPDF: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            parserConfiguration

            Divider()

            runStatus
            primaryAction

            if !coordinator.outputText.isEmpty {
                output
            }

            Divider()

            HStack {
                Button("Show PDF", action: revealPDF)
                    .disabled(document == nil)
                Spacer()
                Button("Show Runs", action: coordinator.revealRunsFolder)
            }
            .buttonStyle(.plain)
            .font(.caption)
        }
    }

    private var parserConfiguration: some View {
        VStack(alignment: .leading, spacing: 8) {
            Picker("Parser", selection: $coordinator.selectedProviderID) {
                ForEach(coordinator.descriptors) { descriptor in
                    Text(descriptor.name)
                        .tag(descriptor.id)
                }
            }
            .pickerStyle(.menu)
            .disabled(coordinator.isRunning || coordinator.isInstalling)

            Text(coordinator.selectedDescriptor.summary)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 6) {
                Circle()
                    .fill(coordinator.selectedAvailability.isReady ? Color.green : Color.secondary)
                    .frame(width: 7, height: 7)
                    .accessibilityHidden(true)
                Text(coordinator.selectedAvailability.message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let setupNote = coordinator.selectedDescriptor.setupNote {
                Text(setupNote)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var runStatus: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(coordinator.statusMessage)
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

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
    }

    @ViewBuilder
    private var primaryAction: some View {
        if coordinator.selectedAvailability.isReady {
            Button(action: parse) {
                Text(coordinator.isRunning ? "Parsing…" : "Parse")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(document == nil || coordinator.isRunning || coordinator.isInstalling)
            .accessibilityHint("Parses the open PDF locally only after this button is pressed")
        } else {
            Button(action: coordinator.installSelectedProvider) {
                Text(coordinator.isInstalling ? "Setting Up…" : "Set Up Parser")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(coordinator.isRunning || coordinator.isInstalling)
            .accessibilityHint("Downloads this parser once for future offline use")
        }
    }

    private var output: some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()

            HStack {
                Text("Markdown")
                    .font(.callout.weight(.semibold))
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
            .frame(minHeight: 140, maxHeight: 240)
            .background(.quaternary.opacity(0.2))
            .clipShape(.rect(cornerRadius: 8))
        }
    }
}
