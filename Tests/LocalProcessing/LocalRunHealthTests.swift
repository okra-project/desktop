import Foundation
import Testing
@testable import Okra

struct LocalRunHealthTests {
    private static let oneGiB: UInt64 = 1 << 30

    @Test("Healthy memory with fresh progress shows no warning")
    func healthyRunShowsNoWarning() {
        let memory = SystemMemoryStatus(
            freeBytes: 8 * Self.oneGiB,
            swapUsedBytes: 0,
            swapTotalBytes: 4 * Self.oneGiB
        )

        #expect(memory.isCriticallyLow == false)
        #expect(
            LocalRunHealth.message(idleFor: 5, stallThreshold: 90, memory: memory) == nil
        )
    }

    @Test("Low free memory with heavy swap is critically low")
    func thrashingMemoryIsCriticallyLow() {
        // Matches the observed stall: ~320 MB free, 11.1 of 12 GB swap used.
        let memory = SystemMemoryStatus(
            freeBytes: 320 * 1_000_000,
            swapUsedBytes: 11 * Self.oneGiB,
            swapTotalBytes: 12 * Self.oneGiB
        )

        #expect(memory.isCriticallyLow)
        let message = LocalRunHealth.message(idleFor: 5, stallThreshold: 90, memory: memory)
        #expect(message?.contains("Low on memory") == true)
        #expect(message?.contains("Quitting heavy apps can help.") == true)
    }

    @Test("Nearly exhausted swap alone is critically low")
    func exhaustedSwapIsCriticallyLow() {
        let memory = SystemMemoryStatus(
            freeBytes: 6 * Self.oneGiB,
            swapUsedBytes: 9 * Self.oneGiB,
            swapTotalBytes: 10 * Self.oneGiB
        )

        #expect(memory.isCriticallyLow)
    }

    @Test("Low free memory without swap pressure is not critical")
    func lowFreeMemoryAloneIsNotCritical() {
        let memory = SystemMemoryStatus(
            freeBytes: 500 * 1_000_000,
            swapUsedBytes: Self.oneGiB,
            swapTotalBytes: 8 * Self.oneGiB
        )

        #expect(memory.isCriticallyLow == false)
    }

    @Test("Stalled run reports the idle duration without killing work")
    func stalledRunReportsIdleDuration() {
        let memory = SystemMemoryStatus(
            freeBytes: 8 * Self.oneGiB,
            swapUsedBytes: 0,
            swapTotalBytes: 0
        )

        let message = LocalRunHealth.message(idleFor: 125, stallThreshold: 90, memory: memory)
        #expect(message?.contains("Taking longer than expected") == true)
        #expect(message?.contains("2 minutes") == true)
        #expect(message?.contains("still active") == true)
    }

    @Test("Stalled and memory-pressed run combines both signals")
    func stalledLowMemoryRunCombinesSignals() {
        let memory = SystemMemoryStatus(
            freeBytes: 300 * 1_000_000,
            swapUsedBytes: 11 * Self.oneGiB,
            swapTotalBytes: 12 * Self.oneGiB
        )

        let message = LocalRunHealth.message(idleFor: 95, stallThreshold: 90, memory: memory)
        #expect(message?.contains("Low on memory") == true)
        #expect(message?.contains("no progress for 95 seconds") == true)
    }

    @Test("Idle formatting switches from seconds to minutes")
    func idleFormatting() {
        #expect(LocalRunHealth.formatIdle(95) == "95 seconds")
        #expect(LocalRunHealth.formatIdle(120) == "2 minutes")
        #expect(LocalRunHealth.formatIdle(60) == "60 seconds")
        #expect(LocalRunHealth.formatIdle(60 * 9) == "9 minutes")
        #expect(LocalRunHealth.formatIdle(300) == "5 minutes")
    }

    @Test("Live memory sampler returns a consistent snapshot")
    func liveSamplerReturnsConsistentSnapshot() {
        let status = SystemMemorySampler.sample()

        #expect(status.freeBytes > 0)
        #expect(status.swapUsedBytes <= status.swapTotalBytes || status.swapTotalBytes == 0)
    }
}
