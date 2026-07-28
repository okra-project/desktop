import SwiftUI

struct StructuredExtractionPreview: View {
    let document: StructuredExtractionDocument
    let selectedBlockID: String?
    let selectBlock: (String) -> Void

    var body: some View {
        LazyVStack(alignment: .leading, spacing: WorkspaceTheme.sectionSpacing) {
            ForEach(document.pages) { page in
                VStack(alignment: .leading, spacing: WorkspaceTheme.standardSpacing) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Page \(page.pageNumber)")
                            .font(.headline)
                        Spacer()
                        if page.diagnostics.duplicateBlockCount > 0 {
                            Text("\(page.diagnostics.duplicateBlockCount) repeats removed")
                                .font(.caption)
                                .foregroundStyle(.orange)
                        }
                    }

                    ForEach(page.blocks) { block in
                        StructuredExtractionBlockView(
                            block: block,
                            pageNumber: page.pageNumber,
                            isSelected: block.id == selectedBlockID,
                            selectBlock: selectBlock
                        )
                        .id(block.id)
                    }
                }

                if page.id != document.pages.last?.id {
                    Divider()
                }
            }
        }
    }
}
