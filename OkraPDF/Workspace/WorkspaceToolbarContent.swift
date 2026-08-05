import SwiftUI

struct WorkspaceToolbarContent: ToolbarContent {
    let document: LocalPDFDocument?
    let isSidebarPresented: Bool
    let isInspectorPresented: Bool
    @ObservedObject var coordinator: LocalProcessingCoordinator
    let toggleSidebar: () -> Void
    let toggleInspector: () -> Void
    let openPDF: () -> Void
    let revealPDF: () -> Void

    var body: some ToolbarContent {
        ToolbarItemGroup(placement: .navigation) {
            BrandMarkView(size: 24)

            WorkspaceToolbarPanelButton(
                title: "Workspace",
                isSelected: isSidebarPresented,
                action: toggleSidebar
            )

            WorkspaceToolbarPanelButton(
                title: "Extract",
                isSelected: isInspectorPresented,
                action: toggleInspector
            )
        }

        ToolbarItem(placement: .principal) {
            Text(document?.fileName ?? "PDF reader")
                .lineLimit(1)
                .truncationMode(.middle)
            .accessibilityLabel(document?.fileName ?? "PDF reader, no document open")
        }

        ToolbarItemGroup(placement: .primaryAction) {
            if coordinator.pdfBoundingBoxOverlays.isEmpty == false {
                Toggle(isOn: $coordinator.showsPDFBoundingBoxes) {
                    Label("Show extraction boxes", systemImage: "viewfinder.rectangular")
                }
                .toggleStyle(.button)
                .labelStyle(.iconOnly)
                .help(
                    coordinator.showsPDFBoundingBoxes
                        ? "Hide extraction boxes"
                        : "Show extraction boxes"
                )
                .accessibilityValue(
                    coordinator.showsPDFBoundingBoxes
                        ? "\(coordinator.pdfBoundingBoxOverlays.count) extraction boxes visible"
                        : "Hidden"
                )
            }

            if document != nil {
                Button(
                    "Reveal source PDF in Finder",
                    systemImage: "arrow.forward.circle",
                    action: revealPDF
                )
                .labelStyle(.iconOnly)
                .help("Reveal the source PDF in Finder")
            }

            Button("Open PDF…", systemImage: "folder", action: openPDF)
                .disabled(coordinator.isRunning || coordinator.isInstalling)
        }
    }
}
