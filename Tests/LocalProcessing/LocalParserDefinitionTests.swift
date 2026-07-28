import Foundation
import Testing
@testable import Okra

struct LocalParserDefinitionTests {
    @Test("Current providers declare distinct runtimes and output adapters")
    func providerContracts() {
        #expect(LocalParserCatalog.appleVision.runtime == .appleVision)
        #expect(LocalParserCatalog.appleVision.outputAdapter == .plainTextV1)
        #expect(LocalParserCatalog.unlimitedOCR.runtime == .mlxVLM)
        #expect(LocalParserCatalog.unlimitedOCR.outputAdapter == .unlimitedOCRTokensV1)
    }

    @Test("Unlimited OCR keeps pinned model lineage and artifacts")
    func unlimitedOCRLineage() throws {
        let package = try #require(LocalParserCatalog.unlimitedOCR.modelDelivery.pinnedPackage)

        #expect(package.upstreamRepository == "baidu/Unlimited-OCR")
        #expect(package.repository == "sahilchachra/unlimited-ocr-4bit-mlx")
        #expect(package.revision == "5df80100fca719eca44a4f5ec2e5a63d31881eb6")
        #expect(package.format == .mlxSafetensors)
        #expect(package.quantization == LocalModelQuantization(bits: 4, scheme: "affine-int4-group-64"))
        #expect(package.licenseSPDXIdentifier == "MIT")
        #expect(package.artifacts == UnlimitedOCRModelManifest.artifacts)
        #expect(package.totalBytes == 2_461_271_624)
    }

    @Test("Pinned model artifacts retain revision-scoped download URLs")
    func artifactDownloadURL() throws {
        let package = try #require(LocalParserCatalog.unlimitedOCR.modelDelivery.pinnedPackage)
        let artifact = try #require(package.artifacts.first { $0.path == "model.safetensors" })
        let url = try #require(package.downloadURL(for: artifact))

        #expect(
            url.absoluteString
                == "https://huggingface.co/sahilchachra/unlimited-ocr-4bit-mlx/resolve/5df80100fca719eca44a4f5ec2e5a63d31881eb6/model.safetensors?download=true"
        )
    }

    @Test("Unlimited OCR supports the baseline 16 GB Apple-silicon Mac")
    func baselineMacCompatibility() {
        let host = LocalParserHostProfile(
            architecture: .appleSilicon,
            macOSMajorVersion: 13,
            unifiedMemoryGB: 16,
            availableDiskBytes: 3_000_000_000
        )

        #expect(LocalParserCatalog.unlimitedOCR.requirements.compatibility(with: host) == .supported)
    }

    @Test("Unlimited OCR reports every incompatible host constraint")
    func incompatibleHost() {
        let host = LocalParserHostProfile(
            architecture: .intel,
            macOSMajorVersion: 12,
            unifiedMemoryGB: 8,
            availableDiskBytes: 1_000_000_000
        )

        #expect(
            LocalParserCatalog.unlimitedOCR.requirements.compatibility(with: host)
                == .unsupported([
                    .architecture(.intel),
                    .macOS(minimumMajorVersion: 13),
                    .unifiedMemory(minimumGB: 16),
                    .freeDisk(requiredBytes: 3_000_000_000, availableBytes: 1_000_000_000),
                ])
        )
    }

    @Test("Parser definitions round-trip for run provenance")
    func codableRoundTrip() throws {
        let definitions = [
            LocalParserCatalog.appleVision,
            LocalParserCatalog.unlimitedOCR,
        ]
        let data = try JSONEncoder().encode(definitions)
        let decoded = try JSONDecoder().decode([LocalParserDefinition].self, from: data)

        #expect(decoded == definitions)
    }

    @Test("Provider setup size comes from its pinned package")
    func providerDownloadSize() {
        let descriptor = UnlimitedOCRProcessingProvider().descriptor

        #expect(descriptor.downloadSizeBytes == UnlimitedOCRModelManifest.totalBytes)
    }
}
