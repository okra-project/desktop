import SwiftUI

struct LocalExtractionView: View {
    let document: LocalPDFDocument?
    @ObservedObject var coordinator: LocalProcessingCoordinator
    let parse: () -> Void
    let revealPDF: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: WorkspaceTheme.sectionSpacing) {
            WorkspaceInspectorSection(
                "Configuration",
                detail: "Choose the parser used for this document."
            ) {
                ProviderPickerView(coordinator: coordinator)
                ProviderStatusView(coordinator: coordinator)
            }

            Divider()
            WorkspaceInspectorSection(
                "Action",
                detail: "Nothing runs until you start or resume a parse."
            ) {
                if document != nil {
                    extractionControls
                } else {
                    WorkspaceNoticeView(
                        message: "Open a PDF to enable parsing.",
                        systemImage: "info.circle",
                        color: .secondary
                    )
                }
            }

            if coordinator.outputText.isEmpty == false {
                ExtractionOutputView(coordinator: coordinator)
            }
        }
    }

    @ViewBuilder
    private var extractionControls: some View {
        if coordinator.isInstalling {
            ProviderSetupView(coordinator: coordinator)
        } else if coordinator.isRunning {
            RunProgressView(coordinator: coordinator)
        } else if coordinator.canResumeLatestRun, let document {
            VStack(alignment: .leading, spacing: WorkspaceTheme.standardSpacing) {
                Text(coordinator.statusMessage)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                Button {
                    coordinator.resume(document: document)
                } label: {
                    Text(resumeButtonTitle)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityHint("Continues this run using pages already saved on this Mac")

                Button("Start New Run", action: parse)
                    .buttonStyle(.bordered)
            }
        } else if coordinator.selectedAvailability.isReady {
            VStack(alignment: .leading, spacing: WorkspaceTheme.standardSpacing) {
                Text(coordinator.statusMessage)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                Button(action: parse) {
                    Text("Parse with \(coordinator.selectedDescriptor.name)")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityHint("Extracts on this Mac without uploading the PDF")
            }
        } else {
            ProviderSetupView(coordinator: coordinator)
        }
    }

    private var resumeButtonTitle: String {
        let completed = coordinator.completedPageCount
        let total = coordinator.totalPageCount
        guard completed > 0, total > completed else { return "Resume Run" }
        return "Resume from Page \(completed + 1)"
    }
}
