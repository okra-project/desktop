import Foundation

struct ParserPageLifecycleGroup: Identifiable, Equatable {
    let parserID: String
    let parserName: String
    let lifecycles: [ParserPageLifecycle]

    var id: String { parserID }
}
