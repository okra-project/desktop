# okraPDF Desktop v0.5.0-beta.5

This beta replaces the menu-bar utility with a small, normal macOS PDF reader.

## Changed

- Opens one visible reader window with native PDFKit rendering.
- Keeps local parser choice in a narrow inspector beside the PDF.
- Opening, dropping, or replacing a PDF only loads it for reading.
- Parsing starts only after clicking **Parse**.
- Registers as a PDF viewer so Finder can open a PDF directly in okraPDF.

## Fixed

- Removes the accessory/menu-bar lifecycle that could disappear or terminate silently while opening a PDF.
- Removes eager parsing from both the file picker and drag-and-drop paths.

The PDF and generated Markdown remain local. Apple Vision still works without
setup; Docling and Unlimited-OCR remain optional offline providers.
