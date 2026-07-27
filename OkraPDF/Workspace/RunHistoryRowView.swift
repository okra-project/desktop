import SwiftUI

struct RunHistoryRowView: View {
    let run: LocalProcessingRun

    var body: some View {
        HStack(alignment: .top, spacing: WorkspaceTheme.standardSpacing) {
            Image(systemName: run.status == "succeeded" ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                .foregroundStyle(run.status == "succeeded" ? WorkspaceTheme.brand : .orange)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                Text(run.fileName)
                    .lineLimit(1)
                Text(run.providerName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(run.startedAt, format: .relative(presentation: .named))
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(run.fileName), \(run.providerName), \(run.status)")
    }
}
