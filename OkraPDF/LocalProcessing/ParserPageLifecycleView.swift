import SwiftUI

struct ParserPageLifecycleView: View {
    let parserName: String
    let lifecycles: [ParserPageLifecycle]

    var body: some View {
        VStack(alignment: .leading, spacing: WorkspaceTheme.standardSpacing) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: WorkspaceTheme.compactSpacing) {
                    Text("Page lifecycle")
                        .font(.headline)
                    Text(parserName)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Label(
                    rollup.presentation.title,
                    systemImage: rollup.presentation.systemImage
                )
                .font(.callout)
                .foregroundStyle(.secondary)
            }

            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: WorkspaceTheme.compactSpacing) {
                    ForEach(lifecycles) { lifecycle in
                        ParserPageLifecycleBadgeView(
                            parserName: parserName,
                            lifecycle: lifecycle
                        )
                    }
                }
            }
            .scrollIndicators(.hidden)
            .accessibilityLabel("Page lifecycle for \(parserName)")

            Text("Saved per parser and page so reopening this run preserves what is active, complete, or needs attention.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(WorkspaceTheme.standardSpacing)
        .background(.quaternary.opacity(0.2), in: .rect(cornerRadius: WorkspaceTheme.cardRadius))
    }

    private var rollup: ParserLifecycleState {
        ParserLifecycleState.rollup(lifecycles.map(\.state))
    }
}

#if canImport(PreviewsMacros)
#Preview("All parser lifecycle states") {
    ParserPageLifecycleView(
        parserName: "Apple Vision",
        lifecycles: ParserLifecycleState.allCases.enumerated().map { index, state in
            ParserPageLifecycle(
                parserID: "apple-vision",
                pageNumber: index + 1,
                state: state,
                detail: state.presentation.accessibilityDescription,
                updatedAt: .now
            )
        }
    )
    .frame(width: 420)
    .padding()
}
#endif
