import SwiftUI

struct WorkspaceTrailingRailView: View {
    let documentIsOpen: Bool
    let isInspectorPresented: Bool
    @ObservedObject var coordinator: LocalProcessingCoordinator
    let focusedPanelToggle: FocusState<WorkspacePanel?>.Binding
    let toggleInspector: () -> Void
    let revealPDF: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            WorkspaceRailButton(
                "Extract",
                systemImage: "text.viewfinder",
                isSelected: isInspectorPresented,
                focusedPanelToggle: focusedPanelToggle,
                focusTarget: .inspector,
                action: toggleInspector
            )

            if coordinator.pdfBoundingBoxOverlays.isEmpty == false {
                WorkspaceRailButton(
                    coordinator.showsPDFBoundingBoxes
                        ? "Hide extraction boxes"
                        : "Show extraction boxes",
                    systemImage: "viewfinder.rectangular",
                    isSelected: coordinator.showsPDFBoundingBoxes,
                    action: toggleBoundingBoxes
                )
                .accessibilityValue(
                    coordinator.showsPDFBoundingBoxes
                        ? "\(coordinator.pdfBoundingBoxOverlays.count) extraction boxes visible"
                        : "Hidden"
                )
            }

            Spacer()

            if documentIsOpen {
                WorkspaceRailButton(
                    "Reveal source PDF in Finder",
                    systemImage: "arrow.forward.circle",
                    action: revealPDF
                )
            }
        }
        .padding(.vertical, WorkspaceTheme.standardSpacing)
        .frame(width: WorkspaceTheme.railWidth)
        .background(.bar)
    }

    private func toggleBoundingBoxes() {
        coordinator.showsPDFBoundingBoxes.toggle()
    }
}
