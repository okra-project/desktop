import SwiftUI

struct ProviderSetupView: View {
    @ObservedObject var coordinator: LocalProcessingCoordinator

    var body: some View {
        VStack(alignment: .leading, spacing: WorkspaceTheme.standardSpacing) {
            if let setupProgress = coordinator.setupProgress {
                HStack {
                    Text(setupProgress.phase.title)
                        .font(.headline)
                    Spacer()
                    if let fraction = setupProgress.fraction {
                        Text(fraction, format: .percent.precision(.fractionLength(0)))
                            .foregroundStyle(.secondary)
                    }
                }

                if let fraction = setupProgress.fraction {
                    ProgressView(value: fraction)
                        .accessibilityLabel(setupProgress.message)
                } else {
                    ProgressView()
                        .controlSize(.small)
                        .accessibilityLabel(setupProgress.message)
                }

                Text(setupProgress.message)
                    .font(.callout)
                    .foregroundStyle(.secondary)

                Button("Cancel setup", role: .cancel, action: coordinator.cancelInstallation)
                    .buttonStyle(.bordered)
            } else {
                setupSummary

                if let error = coordinator.setupErrorMessage {
                    WorkspaceNoticeView(
                        message: error,
                        systemImage: "exclamationmark.triangle.fill",
                        color: .red
                    )
                }

                Button(action: coordinator.installSelectedProvider) {
                    Text(coordinator.setupErrorMessage == nil
                         ? "Set up \(coordinator.selectedDescriptor.name)"
                         : "Retry setup")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityHint("Downloads this provider once for future offline extraction")
            }
        }
        .padding(WorkspaceTheme.standardSpacing)
        .background(.quaternary.opacity(0.25), in: .rect(cornerRadius: WorkspaceTheme.cardRadius))
    }

    private var setupSummary: some View {
        VStack(alignment: .leading, spacing: WorkspaceTheme.compactSpacing) {
            Text("One-time local setup")
                .font(.headline)
            Text("The model is downloaded to this Mac. After setup, PDF extraction runs with network access disabled.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if let downloadSize = coordinator.selectedDescriptor.downloadSizeBytes {
                LabeledContent("Download") {
                    Text(downloadSize, format: .byteCount(style: .file))
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            if let location = coordinator.selectedDescriptor.installLocation {
                LabeledContent("Location", value: location)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
