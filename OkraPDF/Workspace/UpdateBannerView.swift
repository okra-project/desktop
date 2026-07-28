import SwiftUI

/// Thin banner announcing a newer desktop beta. Dismissal is per-release-tag,
/// so the next beta re-announces itself.
struct UpdateBannerView: View {
    let update: DesktopUpdate
    let openRelease: () -> Void
    let dismiss: () -> Void

    var body: some View {
        HStack(spacing: WorkspaceTheme.standardSpacing) {
            Image(systemName: "arrow.triangle.2.circlepath")
            Text("Okra Desktop \(update.versionString) is available.")
                .font(.callout)
            Spacer()
            Button("View Release", action: openRelease)
                .buttonStyle(.bordered)
            Button(action: dismiss) {
                Image(systemName: "xmark")
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Dismiss update notice")
        }
        .padding(.horizontal, WorkspaceTheme.panelPadding)
        .padding(.vertical, WorkspaceTheme.compactSpacing)
        .foregroundStyle(.white)
        .background(WorkspaceTheme.brand)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Okra Desktop \(update.versionString) is available")
    }
}
