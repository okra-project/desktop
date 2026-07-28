import AppKit
import Foundation
import Testing
@testable import Okra

struct DesktopBrandTests {
    @Test("Desktop bundles the canonical website mark")
    func canonicalWebsiteMarkIsBundled() throws {
        let markURL = try #require(OkraBrand.markURL)
        let fileSize = try markURL.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        let digest = try FileSHA256.digest(
            of: markURL,
            expectedBytes: Int64(fileSize),
            progress: { _ in }
        )

        #expect(digest == OkraBrand.canonicalMarkSHA256)
        #expect(OkraBrand.markImage != nil)
    }
}
