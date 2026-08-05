import SwiftUI

struct WorkspaceRailButton: View {
    let title: String
    let systemImage: String
    let isSelected: Bool
    let isEnabled: Bool
    let focusedPanelToggle: FocusState<WorkspacePanel?>.Binding?
    let focusTarget: WorkspacePanel?
    let action: () -> Void

    init(
        _ title: String,
        systemImage: String,
        isSelected: Bool = false,
        isEnabled: Bool = true,
        focusedPanelToggle: FocusState<WorkspacePanel?>.Binding? = nil,
        focusTarget: WorkspacePanel? = nil,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.systemImage = systemImage
        self.isSelected = isSelected
        self.isEnabled = isEnabled
        self.focusedPanelToggle = focusedPanelToggle
        self.focusTarget = focusTarget
        self.action = action
    }

    var body: some View {
        if let focusedPanelToggle, let focusTarget {
            railButton
                .focusable()
                .focused(focusedPanelToggle, equals: focusTarget)
        } else {
            railButton
        }
    }

    private var railButton: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .frame(
                    width: WorkspaceTheme.railControlSize,
                    height: WorkspaceTheme.railControlSize
                )
                .background(
                    isSelected ? Color.primary.opacity(0.09) : Color.clear,
                    in: .rect(cornerRadius: 8)
                )
                .overlay(alignment: .leading) {
                    Capsule()
                        .fill(isSelected ? Color.primary.opacity(0.7) : Color.clear)
                        .frame(width: 2, height: 18)
                        .offset(x: -5)
                }
        }
            .buttonStyle(.plain)
            .foregroundStyle(isSelected ? Color.primary : Color.secondary)
            .frame(width: WorkspaceTheme.railWidth, height: WorkspaceTheme.railWidth)
            .contentShape(.rect)
            .help(title)
            .disabled(isEnabled == false)
            .accessibilityLabel(title)
            .accessibilityValue(isSelected ? "Selected" : "")
    }
}
