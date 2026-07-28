import SwiftUI

struct BrandMarkView: View {
    let size: CGFloat

    init(size: CGFloat = 40) {
        self.size = size
    }

    var body: some View {
        if let markImage = OkraBrand.markImage {
            Image(nsImage: markImage)
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: size, height: size)
                .accessibilityLabel("Okra")
        } else {
            Text("Okra")
                .font(.title2)
                .bold()
        }
    }
}
