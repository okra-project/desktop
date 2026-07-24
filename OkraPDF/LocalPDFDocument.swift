import Foundation

struct LocalPDFDocument: Identifiable, Equatable {
    let id: String
    let fileName: String
    let filePath: String
    let totalPages: Int

    var fileURL: URL {
        URL(fileURLWithPath: filePath)
    }
}
