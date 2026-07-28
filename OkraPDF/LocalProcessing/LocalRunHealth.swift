import Darwin
import Foundation

/// A point-in-time view of system memory used to warn when a local run is
/// likely thrashing instead of parsing.
struct SystemMemoryStatus: Equatable, Sendable {
    let freeBytes: UInt64
    let swapUsedBytes: UInt64
    let swapTotalBytes: UInt64

    var swapUsedFraction: Double {
        guard swapTotalBytes > 0 else { return 0 }
        return Double(swapUsedBytes) / Double(swapTotalBytes)
    }

    /// True when the machine is likely thrashing: little free memory with
    /// meaningful swap pressure, or swap nearly exhausted on its own.
    var isCriticallyLow: Bool {
        let oneGiB: UInt64 = 1 << 30
        if swapUsedFraction >= 0.85 {
            return true
        }
        return freeBytes < oneGiB && swapUsedFraction >= 0.5
    }
}

enum SystemMemorySampler {
    static func sample() -> SystemMemoryStatus {
        SystemMemoryStatus(
            freeBytes: sampleFreeBytes(),
            swapUsedBytes: sampleSwap().used,
            swapTotalBytes: sampleSwap().total
        )
    }

    private static func sampleFreeBytes() -> UInt64 {
        var pageSize = vm_size_t()
        guard host_page_size(mach_host_self(), &pageSize) == KERN_SUCCESS else {
            return 0
        }

        var statistics = vm_statistics64()
        var count = mach_msg_type_number_t(
            MemoryLayout<vm_statistics64>.stride / MemoryLayout<integer_t>.stride
        )
        let result = withUnsafeMutablePointer(to: &statistics) { pointer in
            pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { rebound in
                host_statistics64(mach_host_self(), HOST_VM_INFO64, rebound, &count)
            }
        }
        guard result == KERN_SUCCESS else { return 0 }
        return UInt64(statistics.free_count) * UInt64(pageSize)
    }

    private static func sampleSwap() -> (used: UInt64, total: UInt64) {
        var usage = xsw_usage()
        var size = MemoryLayout<xsw_usage>.stride
        let result = sysctlbyname("vm.swapusage", &usage, &size, nil, 0)
        guard result == 0 else { return (0, 0) }
        return (usage.xsu_used, usage.xsu_total)
    }
}

/// Passive run-health messaging. Nothing here kills or restarts work; it only
/// keeps the UI truthful when a local run stops making visible progress or the
/// machine runs out of memory.
enum LocalRunHealth {
    static func message(
        idleFor idle: TimeInterval,
        stallThreshold: TimeInterval,
        memory: SystemMemoryStatus
    ) -> String? {
        let stalled = idle >= stallThreshold
        let lowMemory = memory.isCriticallyLow

        switch (stalled, lowMemory) {
        case (true, true):
            return "Low on memory and no progress for \(formatIdle(idle)) — parsing may be slow or stuck. Quitting heavy apps can help."
        case (true, false):
            return "Taking longer than expected — no progress updates for \(formatIdle(idle)). The run is still active."
        case (false, true):
            return "Low on memory — parsing may be slow or stuck. Quitting heavy apps can help."
        case (false, false):
            return nil
        }
    }

    static func formatIdle(_ interval: TimeInterval) -> String {
        if interval < 120 {
            return "\(Int(interval)) seconds"
        }
        let minutes = Int(interval / 60)
        return minutes == 1 ? "1 minute" : "\(minutes) minutes"
    }
}
