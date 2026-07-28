import Foundation

enum BundledResourceLocator {
    static func url(
        forResource name: String,
        withExtension fileExtension: String,
        subdirectory: String? = nil
    ) -> URL? {
        if let resourceURL = Bundle.main.resourceURL {
            let packagedBundleURL = resourceURL
                .appendingPathComponent("okraPDF_Okra.bundle", isDirectory: true)
            if let packagedBundle = Bundle(url: packagedBundleURL),
               let url = packagedBundle.url(
                   forResource: name,
                   withExtension: fileExtension,
                   subdirectory: subdirectory
               ) {
                return url
            }
        }

        return Bundle.module.url(
            forResource: name,
            withExtension: fileExtension,
            subdirectory: subdirectory
        )
    }
}
