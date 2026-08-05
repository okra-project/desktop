import SwiftUI

struct WorkspaceToolbarPanelButton: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.callout)
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(
                    isSelected ? Color.primary.opacity(0.09) : Color.clear,
                    in: .rect(cornerRadius: 7)
                )
        }
        .buttonStyle(.plain)
        .accessibilityValue(isSelected ? "Shown" : "Hidden")
    }
}
