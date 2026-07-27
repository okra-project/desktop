import SwiftUI

struct WorkspaceNoticeView: View {
    let message: String
    let systemImage: String
    let color: Color

    var body: some View {
        Label(message, systemImage: systemImage)
            .font(.callout)
            .foregroundStyle(color)
            .fixedSize(horizontal: false, vertical: true)
            .padding(WorkspaceTheme.standardSpacing)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(color.opacity(0.08), in: .rect(cornerRadius: WorkspaceTheme.cardRadius))
    }
}
