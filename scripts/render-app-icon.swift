#!/usr/bin/env swift

import AppKit
import Foundation

enum RenderError: Error {
  case invalidArguments
  case failedToLoadImage(String)
  case failedToCreateBitmap
  case failedToEncodePNG
}

func render() throws {
  let args = CommandLine.arguments
  guard args.count == 3 else {
    throw RenderError.invalidArguments
  }

  let inputURL = URL(fileURLWithPath: args[1])
  let outputURL = URL(fileURLWithPath: args[2])

  guard let image = NSImage(contentsOf: inputURL) else {
    throw RenderError.failedToLoadImage(inputURL.path)
  }

  let width = max(Int(image.size.width.rounded()), 1)
  let height = max(Int(image.size.height.rounded()), 1)
  let edge = max(min(width, height), 1)
  let canvasSize = NSSize(width: edge, height: edge)
  let canvasRect = NSRect(origin: .zero, size: canvasSize)

  guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: edge,
    pixelsHigh: edge,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  ) else {
    throw RenderError.failedToCreateBitmap
  }

  bitmap.size = canvasSize

  guard let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
    throw RenderError.failedToCreateBitmap
  }

  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = context

  NSColor.clear.setFill()
  canvasRect.fill()

  let radius = canvasSize.width * 0.225
  let clipPath = NSBezierPath(roundedRect: canvasRect, xRadius: radius, yRadius: radius)
  clipPath.addClip()

  image.draw(
    in: canvasRect,
    from: NSRect(origin: .zero, size: image.size),
    operation: .copy,
    fraction: 1.0,
    respectFlipped: false,
    hints: [.interpolation: NSImageInterpolation.high]
  )

  NSGraphicsContext.restoreGraphicsState()

  guard let pngData = bitmap.representation(using: .png, properties: [:]) else {
    throw RenderError.failedToEncodePNG
  }

  try pngData.write(to: outputURL, options: .atomic)
}

do {
  try render()
} catch {
  fputs("render-app-icon.swift: \(error)\n", stderr)
  exit(1)
}
