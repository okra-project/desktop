import PDFKit

final class PDFDocumentViewCoordinator {
    var onOverlaySelection: (String) -> Void

    private weak var pdfView: PDFBoundingBoxView?
    private weak var renderedDocument: PDFDocument?
    private var renderedOverlays: [PDFBoundingBoxOverlay] = []
    private var annotationsByOverlayID: [String: PDFAnnotation] = [:]
    private var overlaysByID: [String: PDFBoundingBoxOverlay] = [:]
    private var selectedOverlayID: String?

    init(onOverlaySelection: @escaping (String) -> Void) {
        self.onOverlaySelection = onOverlaySelection
    }

    func connect(to pdfView: PDFBoundingBoxView) {
        self.pdfView = pdfView
        pdfView.handleOverlayClick = { [weak self] page, point in
            self?.handleOverlayClick(on: page, at: point) ?? false
        }
    }

    func synchronize(
        document: PDFDocument?,
        overlays: [PDFBoundingBoxOverlay],
        selectedOverlayID: String?
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

        let selectionChanged = self.selectedOverlayID != selectedOverlayID
        if selectionChanged || documentChanged || overlaysChanged {
            updateSelection(selectedOverlayID, in: pdfView)
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
                      selected: overlay.id == selectedOverlayID
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

    private func updateSelection(_ newSelection: String?, in pdfView: PDFBoundingBoxView) {
        let changedIDs = Set([selectedOverlayID, newSelection].compactMap { $0 })
        selectedOverlayID = newSelection

        for id in changedIDs {
            guard let annotation = annotationsByOverlayID[id],
                  let overlay = overlaysByID[id] else {
                continue
            }
            PDFBoundingBoxAnnotationFactory.applyStyle(
                to: annotation,
                label: overlay.label,
                selected: id == newSelection
            )
            if let page = annotation.page {
                pdfView.annotationsChanged(on: page)
            }
        }

        guard let newSelection,
              let annotation = annotationsByOverlayID[newSelection],
              let page = annotation.page else {
            return
        }
        pdfView.go(to: annotation.bounds.insetBy(dx: -8, dy: -8), on: page)
    }

    func handleOverlayClick(on page: PDFPage, at point: CGPoint) -> Bool {
        let hit = annotationsByOverlayID
            .filter { $0.value.page === page && $0.value.bounds.contains(point) }
            .min { left, right in
                let leftArea = left.value.bounds.width * left.value.bounds.height
                let rightArea = right.value.bounds.width * right.value.bounds.height
                return leftArea < rightArea
            }
        guard let overlayID = hit?.key else { return false }
        onOverlaySelection(overlayID)
        return true
    }
}
