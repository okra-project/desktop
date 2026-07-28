import Foundation

struct ParserPageLifecycle: Identifiable, Codable, Equatable, Sendable {
    let parserID: String
    let pageNumber: Int
    private(set) var state: ParserLifecycleState
    private(set) var detail: String?
    private(set) var updatedAt: Date

    var id: String {
        "\(parserID):\(pageNumber)"
    }

    init(
        parserID: String,
        pageNumber: Int,
        state: ParserLifecycleState,
        detail: String?,
        updatedAt: Date
    ) {
        self.parserID = parserID
        self.pageNumber = pageNumber
        self.state = state
        self.detail = detail
        self.updatedAt = updatedAt
    }

    @discardableResult
    mutating func transition(
        to nextState: ParserLifecycleState,
        detail: String?,
        at timestamp: Date
    ) -> Bool {
        guard state.canTransition(to: nextState) else {
            return false
        }
        state = nextState
        self.detail = detail
        updatedAt = timestamp
        return true
    }

    static func idlePages(
        parserID: String,
        pageCount: Int,
        at timestamp: Date
    ) -> [ParserPageLifecycle] {
        guard pageCount > 0 else { return [] }
        return (1...pageCount).map { pageNumber in
            ParserPageLifecycle(
                parserID: parserID,
                pageNumber: pageNumber,
                state: .idle,
                detail: nil,
                updatedAt: timestamp
            )
        }
    }

    static func applying(
        parserID: String,
        pageNumber: Int,
        state: ParserLifecycleState,
        totalPageCount: Int,
        detail: String?,
        at timestamp: Date,
        to existingLifecycles: [ParserPageLifecycle]
    ) -> [ParserPageLifecycle] {
        guard totalPageCount > 0, (1...totalPageCount).contains(pageNumber) else {
            return existingLifecycles
        }

        var lifecycles = existingLifecycles
        let existingPageNumbers = Set(
            lifecycles
                .filter { $0.parserID == parserID }
                .map(\.pageNumber)
        )
        for missingPageNumber in 1...totalPageCount
        where existingPageNumbers.contains(missingPageNumber) == false {
            lifecycles.append(
                ParserPageLifecycle(
                    parserID: parserID,
                    pageNumber: missingPageNumber,
                    state: .idle,
                    detail: nil,
                    updatedAt: timestamp
                )
            )
        }

        let entryID = "\(parserID):\(pageNumber)"
        if let index = lifecycles.firstIndex(where: { $0.id == entryID }) {
            _ = lifecycles[index].transition(
                to: state,
                detail: detail,
                at: timestamp
            )
        }

        return lifecycles.sorted {
            ($0.parserID, $0.pageNumber) < ($1.parserID, $1.pageNumber)
        }
    }
}
