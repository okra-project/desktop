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
        }
        .padding(WorkspaceTheme.standardSpacing)
        .background(.quaternary.opacity(0.25), in: .rect(cornerRadius: WorkspaceTheme.cardRadius))
    }
}
