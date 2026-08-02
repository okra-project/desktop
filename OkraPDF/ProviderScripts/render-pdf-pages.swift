import AppKit
import Foundation
import PDFKit

let arguments = CommandLine.arguments
guard arguments.count == 3 else {
    FileHandle.standardError.write("Usage: swift render-pdf-pages.swift <input.pdf> <output-dir> [max-dimension]\n".data(using: .utf8)!)
    exit(64)
}

let sourceURL = URL(fileURLWithPath: arguments[1])
let outputDirectory = URL(fileURLWithPath: arguments[2], isDirectory: true)
let maxDimension: CGFloat = 2_048

guard let document = PDFDocument(url: sourceURL), document.pageCount > 0 else {
    FileHandle.standardError.write("Cannot open PDF: \(sourceURL.path)\n".data(using: .utf8)!)
    exit(65)
}

try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

for index in 0..<document.pageCount {
    let pageURL = outputDirectory.appendingPathComponent(String(format: "page-%04d.png", index + 1))
    if FileManager.default.fileExists(atPath: pageURL.path) {
        print("Using prepared page \(index + 1) of \(document.pageCount)")
        continue
    }
    guard let page = document.page(at: index) else {
        FileHandle.standardError.write("Missing page \(index + 1)\n".data(using: .utf8)!)
        exit(65)
    }
    let bounds = page.bounds(for: .cropBox)
    let scale = maxDimension / max(bounds.width, bounds.height)
    let size = NSSize(width: max(1, bounds.width * scale), height: max(1, bounds.height * scale))
    let image = page.thumbnail(of: size, for: .cropBox)
    var proposedRect = NSRect(origin: .zero, size: image.size)
    guard let cgImage = image.cgImage(forProposedRect: &proposedRect, context: nil, hints: nil) else {
        FileHandle.standardError.write("Failed to render page \(index + 1)\n".data(using: .utf8)!)
        exit(65)
    }
    let bitmap = NSBitmapImageRep(cgImage: cgImage)
    guard let data = bitmap.representation(using: .png, properties: [:]) else {
        FileHandle.standardError.write("Failed to encode page \(index + 1)\n".data(using: .utf8)!)
        exit(65)
    }
    try data.write(to: pageURL, options: .atomic)
    print("Rendered page \(index + 1) of \(document.pageCount)")
}
