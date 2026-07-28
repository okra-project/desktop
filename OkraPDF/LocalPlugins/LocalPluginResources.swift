import Foundation

enum LocalPluginResources {
    static func scriptURL(named name: String, extension fileExtension: String) -> URL? {
        BundledResourceLocator.url(
            forResource: name,
            withExtension: fileExtension,
            subdirectory: "PluginScripts"
        )
    }
}
