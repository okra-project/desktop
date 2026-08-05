import SwiftUI

struct WorkspaceLeadingRailView: View {
    let isSidebarPresented: Bool
    @ObservedObject var coordinator: LocalProcessingCoordinator
    let focusedPanelToggle: FocusState<WorkspacePanel?>.Binding
    let toggleSidebar: () -> Void
    let openPDF: () -> Void
    let revealRuns: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            WorkspaceRailButton(
                "Workspace",
                systemImage: "sidebar.left",
                isSelected: isSidebarPresented,
                focusedPanelToggle: focusedPanelToggle,
                focusTarget: .sidebar,
                action: toggleSidebar
            )

            WorkspaceRailButton(
                "Open PDF…",
                systemImage: "folder",
                isEnabled: coordinator.isRunning == false && coordinator.isInstalling == false,
                action: openPDF
            )

            Spacer()

            WorkspaceRailButton(
                "Show local runs",
                systemImage: "clock.arrow.circlepath",
                action: revealRuns
            )
        }
        .padding(.vertical, WorkspaceTheme.standardSpacing)
        .frame(width: WorkspaceTheme.railWidth)
        .background(.bar)
    }
}
