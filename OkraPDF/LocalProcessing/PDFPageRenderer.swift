import AppKit
import Foundation
import PDFKit

enum PDFPageRenderer {
    static func openDocument(at sourceURL: URL) throws -> PDFDocument {
        guard let document = PDFDocument(url: sourceURL) else {
            throw LocalProcessingError.invalidPDF
        }
        guard document.pageCount > 0 else {
            throw LocalProcessingError.noPages
        }
        return document
    }

    static func pageImage(
        from document: PDFDocument,
        at index: Int,
        maxDimension: CGFloat
    ) throws -> CGImage {
        guard let page = document.page(at: index) else {
            throw LocalProcessingError.invalidPDF
        }
        let bounds = page.bounds(for: .cropBox)
        let scale = maxDimension / max(bounds.width, bounds.height)
        let size = NSSize(
            width: max(1, bounds.width * scale),
            height: max(1, bounds.height * scale)
        )
        let image = page.thumbnail(of: size, for: .cropBox)
        var proposedRect = NSRect(origin: .zero, size: image.size)
        guard let cgImage = image.cgImage(forProposedRect: &proposedRect, context: nil, hints: nil) else {
            throw LocalProcessingError.invalidPDF
        }
        return cgImage
    }

    static func writePagePNGs(
        from sourceURL: URL,
        to directory: URL,
        maxDimension: CGFloat,
        progress: @escaping LocalProcessingProgress
    ) throws -> [URL] {
        let document = try openDocument(at: sourceURL)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        return try (0..<document.pageCount).map { index in
            try Task.checkCancellation()
            let url = directory.appendingPathComponent(String(format: "page-%04d.png", index + 1))
            if FileManager.default.fileExists(atPath: url.path) {
                let fraction = Double(index + 1) / Double(document.pageCount)
                progress(fraction * 0.2, "Using prepared page \(index + 1) of \(document.pageCount)")
                return url
            }
            let image = try pageImage(from: document, at: index, maxDimension: maxDimension)
            let bitmap = NSBitmapImageRep(cgImage: image)
            guard let data = bitmap.representation(using: .png, properties: [:]) else {
                throw LocalProcessingError.invalidPDF
            }
            try data.write(to: url, options: .atomic)
            let fraction = Double(index + 1) / Double(document.pageCount)
            progress(fraction * 0.2, "Preparing page \(index + 1) of \(document.pageCount)")
            return url
        }
    }
}
