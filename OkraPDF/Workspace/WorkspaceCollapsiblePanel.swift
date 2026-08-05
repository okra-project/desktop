import SwiftUI

struct WorkspaceCollapsiblePanel<Content: View>: View {
    let isPresented: Bool
    let width: CGFloat
    let alignment: Alignment
    @ViewBuilder let content: Content

    var body: some View {
        content
            .frame(width: width)
            .frame(width: isPresented ? width : 0, alignment: alignment)
            .clipped()
            .opacity(isPresented ? 1 : 0)
            .disabled(isPresented == false)
            .allowsHitTesting(isPresented)
            .accessibilityHidden(isPresented == false)
    }
}
