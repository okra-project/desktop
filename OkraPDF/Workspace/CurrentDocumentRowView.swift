import SwiftUI

struct CurrentDocumentRowView: View {
    let document: LocalPDFDocument

    var body: some View {
        HStack(alignment: .top, spacing: WorkspaceTheme.standardSpacing) {
            Text("PDF")
                .font(.caption)
                .bold()
                .foregroundStyle(WorkspaceTheme.brand)
                .padding(.horizontal, 7)
                .padding(.vertical, 5)
                .background(WorkspaceTheme.brand.opacity(0.1), in: .rect(cornerRadius: 6))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                Text(document.fileName)
                    .lineLimit(2)
                Text("^[\(document.totalPages) page](inflect: true) · source stays in place")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
