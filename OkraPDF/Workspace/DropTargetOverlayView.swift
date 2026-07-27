import SwiftUI

struct DropTargetOverlayView: View {
    let isVisible: Bool

    var body: some View {
        RoundedRectangle(cornerRadius: WorkspaceTheme.cardRadius)
            .fill(WorkspaceTheme.brand.opacity(isVisible ? 0.12 : 0))
            .overlay {
                RoundedRectangle(cornerRadius: WorkspaceTheme.cardRadius)
                    .stroke(
                        WorkspaceTheme.brand.opacity(isVisible ? 1 : 0),
                        style: StrokeStyle(lineWidth: 2, dash: [7])
                    )
                    .overlay {
                        Text("Drop to open this PDF")
                            .font(.headline)
                            .foregroundStyle(WorkspaceTheme.brand)
                            .opacity(isVisible ? 1 : 0)
                    }
            }
            .padding(WorkspaceTheme.sectionSpacing)
            .allowsHitTesting(false)
            .accessibilityHidden(isVisible == false)
    }
}
