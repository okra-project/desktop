import SwiftUI

struct RunProgressView: View {
    @ObservedObject var coordinator: LocalProcessingCoordinator

    var body: some View {
        VStack(alignment: .leading, spacing: WorkspaceTheme.standardSpacing) {
            HStack {
                Text("Parsing locally")
                    .font(.headline)
                Spacer()
                Text(coordinator.progress, format: .percent.precision(.fractionLength(0)))
                    .foregroundStyle(.secondary)
            }
            ProgressView(value: coordinator.progress)
                .accessibilityLabel(coordinator.statusMessage)
            if coordinator.totalPageCount > 0 {
                Text("\(coordinator.completedPageCount) of \(coordinator.totalPageCount) pages saved")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Text(coordinator.statusMessage)
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if let healthMessage = coordinator.runHealthMessage {
                Label(healthMessage, systemImage: "exclamationmark.triangle")
                    .font(.callout)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel("Run health warning: \(healthMessage)")
            }

            Button {
                coordinator.cancelRun()
            } label: {
                Text(coordinator.latestRun?.status == "canceling" ? "Canceling…" : "Cancel Run")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .disabled(coordinator.latestRun?.status == "canceling")
            .accessibilityHint("Stops local processing and keeps completed page checkpoints")
        }
        .padding(WorkspaceTheme.standardSpacing)
        .background(.quaternary.opacity(0.25), in: .rect(cornerRadius: WorkspaceTheme.cardRadius))
    }
}
