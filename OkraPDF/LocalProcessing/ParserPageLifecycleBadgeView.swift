import SwiftUI

struct ParserPageLifecycleBadgeView: View {
    let parserName: String
    let lifecycle: ParserPageLifecycle

    var body: some View {
        VStack(spacing: WorkspaceTheme.compactSpacing) {
            Image(systemName: lifecycle.state.presentation.systemImage)
                .font(.headline)
                .accessibilityHidden(true)
            Text("Page \(lifecycle.pageNumber)")
                .font(.caption)
                .bold()
            Text(lifecycle.state.presentation.title)
                .font(.caption)
                .multilineTextAlignment(.center)
        }
        .foregroundStyle(stateColor)
        .padding(WorkspaceTheme.compactSpacing)
        .frame(minWidth: 76, minHeight: 72)
        .background(
            stateColor.opacity(0.08),
            in: .rect(cornerRadius: WorkspaceTheme.cardRadius)
        )
        .overlay {
            RoundedRectangle(cornerRadius: WorkspaceTheme.cardRadius)
                .stroke(stateColor.opacity(0.4))
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityValue(lifecycle.detail ?? lifecycle.state.presentation.title)
    }

    private var accessibilityLabel: String {
        "\(parserName), page \(lifecycle.pageNumber), \(lifecycle.state.presentation.accessibilityDescription)"
    }

    private var stateColor: Color {
        switch lifecycle.state {
        case .idle:
            return .secondary
        case .inProgress:
            return .blue
        case .done:
            return WorkspaceTheme.brand
        case .attention:
            return .orange
        case .error:
            return .red
        }
    }
}
