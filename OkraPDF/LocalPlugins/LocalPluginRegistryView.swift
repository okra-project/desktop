import SwiftUI

struct PresidioInspectorView: View {
    @ObservedObject var coordinator: LocalPluginCoordinator
    let sourceRun: LocalProcessingRun?

    var body: some View {
        VStack(alignment: .leading, spacing: WorkspaceTheme.standardSpacing) {
            Text("Analyze a completed local extraction for names, identifiers, and other sensitive information.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if let definition = presidioDefinition {
                WorkspaceInspectorSection(
                    "Configuration",
                    detail: "Presidio is an extraction operation, not an OCR provider."
                ) {
                    pluginDetails(definition)
                }

                Divider()
                WorkspaceInspectorSection(
                    "Action",
                    detail: "Detection runs only after you invoke it on a completed parse."
                ) {
                    pluginAction(
                        definition,
                        availability: coordinator.availability(for: definition.id)
                    )
                }
            }

            if let detection = coordinator.latestDetection {
                Divider()
                detectionResults(detection)
            }
        }
        .onAppear {
            coordinator.refreshAvailability()
            coordinator.load(run: sourceRun)
        }
        .onChange(of: sourceRun) { run in
            coordinator.load(run: run)
        }
    }

    private var presidioDefinition: LocalPluginDefinition? {
        coordinator.definitions.first(where: { $0.id == .presidioNER })
    }

    private func pluginDetails(_ definition: LocalPluginDefinition) -> some View {
        let availability = coordinator.availability(for: definition.id)

        return VStack(alignment: .leading, spacing: WorkspaceTheme.standardSpacing) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(definition.name)
                        .font(.subheadline.weight(.semibold))
                    Text("\(definition.publisher) · v\(definition.version) · \(definition.license)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(availability.message)
                    .font(.caption)
                    .foregroundStyle(availability.isReady ? Color.secondary : Color.orange)
            }

            Text(definition.summary)
                .font(.callout)
                .fixedSize(horizontal: false, vertical: true)

            Text(definition.permissions.runtimeAllowsNetwork
                 ? "Runtime network access is declared."
                 : "Setup downloads dependencies once. Detection then runs offline and writes only inside this extraction run.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack {
                Link("Project", destination: definition.homepage)
                    .font(.caption)
                Spacer()
                Text(definition.operations.map(\.name).joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func pluginAction(
        _ definition: LocalPluginDefinition,
        availability: LocalPluginAvailability
    ) -> some View {
        if let errorMessage = coordinator.errorMessage,
           coordinator.activePluginID == nil || coordinator.activePluginID == definition.id {
            WorkspaceNoticeView(
                message: errorMessage,
                systemImage: "exclamationmark.triangle.fill",
                color: .red
            )
        }

        if coordinator.isInstalling, coordinator.activePluginID == definition.id {
            VStack(alignment: .leading, spacing: WorkspaceTheme.compactSpacing) {
                if let fraction = coordinator.setupProgress?.fraction {
                    ProgressView(value: fraction)
                } else {
                    ProgressView()
                        .controlSize(.small)
                }
                Text(coordinator.statusMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Button("Cancel Setup", action: coordinator.cancelInstallation)
                    .buttonStyle(.bordered)
            }
        } else if coordinator.isRunning, coordinator.activePluginID == definition.id {
            VStack(alignment: .leading, spacing: WorkspaceTheme.compactSpacing) {
                ProgressView()
                    .controlSize(.small)
                Text(coordinator.statusMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Button("Cancel Detection", action: coordinator.cancelInvocation)
                    .buttonStyle(.bordered)
            }
        } else if availability.isReady == false {
            VStack(alignment: .leading, spacing: WorkspaceTheme.compactSpacing) {
                Text(definition.setupNote)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Button("Install \(definition.name)") {
                    coordinator.install(definition.id)
                }
                .buttonStyle(.borderedProminent)
                .disabled(coordinator.isInstalling || coordinator.isRunning)
            }
        } else {
            Button("Detect PII") {
                guard let sourceRun else { return }
                coordinator.invoke(definition.id, on: sourceRun)
            }
            .buttonStyle(.borderedProminent)
            .frame(maxWidth: .infinity)
            .disabled(coordinator.canInvoke(definition.id, on: sourceRun) == false)
            .accessibilityHint("Analyzes the completed extraction locally without uploading its text")

            if coordinator.canInvoke(definition.id, on: sourceRun) == false {
                Text("Complete a parse before running this plugin.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func detectionResults(_ detection: PresidioDetectionResult) -> some View {
        VStack(alignment: .leading, spacing: WorkspaceTheme.standardSpacing) {
            HStack(alignment: .firstTextBaseline) {
                Text("PII candidates")
                    .font(.headline)
                Spacer()
                Button("Copy JSON", action: coordinator.copyResult)
                    .buttonStyle(.plain)
                Button("Reveal", action: coordinator.revealResult)
                    .buttonStyle(.plain)
            }

            Text(coordinator.statusMessage)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if detection.findings.isEmpty {
                Text("No candidates matched the current entity set and confidence threshold.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(detection.findings.prefix(50)) { finding in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(finding.entityType.replacingOccurrences(of: "_", with: " ").capitalized)
                                .font(.caption.weight(.semibold))
                            Spacer()
                            Text(findingLocation(finding))
                                .font(.caption2.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                        Text(finding.text)
                            .font(.callout)
                            .textSelection(.enabled)
                            .lineLimit(3)
                    }
                    .padding(WorkspaceTheme.compactSpacing)
                    .background(.background.opacity(0.7), in: .rect(cornerRadius: WorkspaceTheme.cardRadius))
                }

                if detection.findings.count > 50 {
                    Text("Showing 50 of \(detection.findings.count) candidates. Open the JSON result to review all findings.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            WorkspaceNoticeView(
                message: "Candidates are not redactions. Review them before a future burn-in step removes PDF content.",
                systemImage: "info.circle",
                color: .secondary
            )
        }
    }

    private func findingLocation(_ finding: PresidioFinding) -> String {
        let score = Int((finding.score * 100).rounded())
        if let page = finding.page, finding.bbox != nil {
            return "Page \(page) · block box · \(score)%"
        }
        if let page = finding.page {
            return "Page \(page) · \(score)%"
        }
        return "Text only · \(score)%"
    }
}
