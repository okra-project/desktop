import Foundation

enum ProviderResources {
    static func scriptURL(named name: String, extension fileExtension: String) -> URL? {
        if let resourceURL = Bundle.main.resourceURL {
            let packagedBundleURL = resourceURL
                .appendingPathComponent("okraPDF_Okra.bundle", isDirectory: true)
            if let packagedBundle = Bundle(url: packagedBundleURL),
               let url = packagedBundle.url(
                   forResource: name,
                   withExtension: fileExtension,
                   subdirectory: "ProviderScripts"
               ) {
                return url
            }
        }

        return Bundle.module.url(
            forResource: name,
            withExtension: fileExtension,
            subdirectory: "ProviderScripts"
        )
    }
}
