import SwiftUI

struct RunHistoryRowView: View {
    let run: LocalProcessingRun

    var body: some View {
        HStack(alignment: .top, spacing: WorkspaceTheme.standardSpacing) {
            Image(systemName: statusIcon)
                .foregroundStyle(statusColor)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                Text(run.fileName)
                    .lineLimit(1)
                Text(run.providerName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let pageProgressDescription {
                    Text(pageProgressDescription)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Text(run.startedAt, format: .relative(presentation: .named))
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(run.fileName), \(run.providerName), \(run.status)")
    }

    private var statusIcon: String {
        switch run.status {
        case "succeeded":
            return "checkmark.circle.fill"
        case "running":
            return "clock.arrow.circlepath"
        case "canceling":
            return "stop.circle"
        case "canceled":
            return "stop.circle.fill"
        case "interrupted":
            return "arrow.clockwise.circle.fill"
        default:
            return "exclamationmark.circle.fill"
        }
    }

    private var statusColor: Color {
        switch run.status {
        case "succeeded":
            return WorkspaceTheme.brand
        case "canceled":
            return .secondary
        default:
            return .orange
        }
    }

    private var pageProgressDescription: String? {
        guard let total = run.totalPageCount, total > 0 else { return nil }
        let completed = run.completedPageCount
            ?? (run.status == "succeeded" ? run.pageCount : 0)
        return "\(completed) of \(total) pages"
    }
}
