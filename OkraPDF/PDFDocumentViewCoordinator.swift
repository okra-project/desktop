import PDFKit

final class PDFDocumentViewCoordinator {
    var onOverlaySelection: (String) -> Void
    var onOverlayHover: (String?) -> Void

    private weak var pdfView: PDFBoundingBoxView?
    private weak var renderedDocument: PDFDocument?
    private var renderedOverlays: [PDFBoundingBoxOverlay] = []
    private var annotationsByOverlayID: [String: PDFAnnotation] = [:]
    private var overlaysByID: [String: PDFBoundingBoxOverlay] = [:]
    private var selectedOverlayID: String?
    private var hoveredOverlayID: String?
    private var pointerOverlayID: String?

    init(onOverlaySelection: @escaping (String) -> Void) {
        self.onOverlaySelection = onOverlaySelection
        onOverlayHover = { _ in }
    }

    init(
        onOverlaySelection: @escaping (String) -> Void,
        onOverlayHover: @escaping (String?) -> Void
    ) {
        self.onOverlaySelection = onOverlaySelection
        self.onOverlayHover = onOverlayHover
    }

    func connect(to pdfView: PDFBoundingBoxView) {
        self.pdfView = pdfView
        pdfView.handleOverlayClick = { [weak self] page, point in
            self?.handleOverlayClick(on: page, at: point) ?? false
        }
        pdfView.handleOverlayHover = { [weak self] page, point in
            self?.handleOverlayHover(on: page, at: point)
        }
    }

    func synchronize(
        document: PDFDocument?,
        overlays: [PDFBoundingBoxOverlay],
        selectedOverlayID: String?,
        hoveredOverlayID: String? = nil
    ) {
        guard let pdfView, let document else {
            removeManagedAnnotations()
            renderedDocument = nil
            return
        }

        let documentChanged = renderedDocument !== document
        let overlaysChanged = renderedOverlays != overlays
        if documentChanged || overlaysChanged {
            rebuildAnnotations(overlays: overlays, in: document, pdfView: pdfView)
        }

        let highlightingChanged = self.selectedOverlayID != selectedOverlayID
            || self.hoveredOverlayID != hoveredOverlayID
        if highlightingChanged || documentChanged || overlaysChanged {
            updateHighlighting(
                selectedOverlayID: selectedOverlayID,
                hoveredOverlayID: hoveredOverlayID,
                in: pdfView
            )
        }

        renderedDocument = document
        renderedOverlays = overlays
    }

    func removeManagedAnnotations() {
        let pages = Set(annotationsByOverlayID.values.compactMap(\.page))
        for annotation in annotationsByOverlayID.values {
            annotation.page?.removeAnnotation(annotation)
        }
        if let pdfView {
            for page in pages {
                pdfView.annotationsChanged(on: page)
            }
        }
        annotationsByOverlayID.removeAll()
        overlaysByID.removeAll()
        renderedOverlays.removeAll()
        selectedOverlayID = nil
        hoveredOverlayID = nil
        pointerOverlayID = nil
    }

    private func rebuildAnnotations(
        overlays: [PDFBoundingBoxOverlay],
        in document: PDFDocument,
        pdfView: PDFBoundingBoxView
    ) {
        removeManagedAnnotations()

        for overlay in overlays.sorted(by: { $0.area > $1.area }) {
            guard annotationsByOverlayID[overlay.id] == nil,
                  let page = document.page(at: overlay.pageNumber - 1),
                  let annotation = PDFBoundingBoxAnnotationFactory.make(
                      overlay: overlay,
                      on: page,
                      selected: overlay.id == selectedOverlayID,
                      hovered: overlay.id == hoveredOverlayID
                  ) else {
                continue
            }
            page.addAnnotation(annotation)
            annotationsByOverlayID[overlay.id] = annotation
            overlaysByID[overlay.id] = overlay
        }

        for page in Set(annotationsByOverlayID.values.compactMap(\.page)) {
            pdfView.annotationsChanged(on: page)
        }
    }

    private func updateHighlighting(
        selectedOverlayID newSelection: String?,
        hoveredOverlayID newHover: String?,
        in pdfView: PDFBoundingBoxView
    ) {
        let selectionChanged = selectedOverlayID != newSelection
        let changedIDs = Set(
            [selectedOverlayID, hoveredOverlayID, newSelection, newHover].compactMap { $0 }
        )
        selectedOverlayID = newSelection
        hoveredOverlayID = newHover

        for id in changedIDs {
            guard let annotation = annotationsByOverlayID[id],
                  let overlay = overlaysByID[id] else {
                continue
            }
            PDFBoundingBoxAnnotationFactory.applyStyle(
                to: annotation,
                label: overlay.label,
                selected: id == newSelection,
                hovered: id == newHover
            )
            if let page = annotation.page {
                pdfView.annotationsChanged(on: page)
            }
        }

        guard selectionChanged,
              let newSelection,
              let annotation = annotationsByOverlayID[newSelection],
              let page = annotation.page else {
            return
        }
        pdfView.go(to: annotation.bounds.insetBy(dx: -8, dy: -8), on: page)
    }

    func handleOverlayClick(on page: PDFPage, at point: CGPoint) -> Bool {
        guard let overlayID = overlayID(on: page, at: point) else { return false }
        onOverlaySelection(overlayID)
        return true
    }

    @discardableResult
    func handleOverlayHover(on page: PDFPage?, at point: CGPoint?) -> String? {
        let overlayID: String? = if let page, let point {
            overlayID(on: page, at: point)
        } else {
            nil
        }
        guard pointerOverlayID != overlayID else { return overlayID }
        pointerOverlayID = overlayID
        onOverlayHover(overlayID)
        return overlayID
    }

    private func overlayID(on page: PDFPage, at point: CGPoint) -> String? {
        annotationsByOverlayID
            .filter { $0.value.page === page && $0.value.bounds.contains(point) }
            .min { left, right in
                let leftArea = left.value.bounds.width * left.value.bounds.height
                let rightArea = right.value.bounds.width * right.value.bounds.height
                return leftArea < rightArea
            }?
            .key
    }
}
