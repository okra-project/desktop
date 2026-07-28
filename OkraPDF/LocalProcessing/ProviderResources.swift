import Foundation

enum ProviderResources {
    static func scriptURL(named name: String, extension fileExtension: String) -> URL? {
        BundledResourceLocator.url(
            forResource: name,
            withExtension: fileExtension,
            subdirectory: "ProviderScripts"
        )
    }
}
