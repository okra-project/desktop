import SwiftUI

struct ProviderPickerView: View {
    @ObservedObject var coordinator: LocalProcessingCoordinator

    var body: some View {
        Menu {
            ForEach(coordinator.descriptors) { descriptor in
                Button {
                    coordinator.selectedProviderID = descriptor.id
                } label: {
                    let availability = coordinator.availabilityByProvider[descriptor.id]?.message
                        ?? "Unavailable"
                    if descriptor.id == coordinator.selectedProviderID {
                        Label("\(descriptor.name) · \(availability)", systemImage: "checkmark")
                    } else {
                        Text("\(descriptor.name) · \(availability)")
                    }
                }
            }
        } label: {
            HStack(spacing: WorkspaceTheme.standardSpacing) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Local parser")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(coordinator.selectedDescriptor.name)
                        .font(.headline)
                }
                Spacer()
                Image(systemName: "chevron.up.chevron.down")
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
            }
            .padding(WorkspaceTheme.standardSpacing)
            .background(.quaternary.opacity(0.35), in: .rect(cornerRadius: WorkspaceTheme.cardRadius))
        }
        .menuStyle(.borderlessButton)
        .disabled(coordinator.isRunning || coordinator.isInstalling)
        .accessibilityLabel("Local extraction model")
        .accessibilityValue(
            "\(coordinator.selectedDescriptor.name), \(coordinator.selectedAvailability.message)"
        )
    }
}
