import Foundation

/// Provider credentials are held only on the server. An explicit debug override is local-only.
enum ServiceEndpoint {
    static func url(_ route:String) throws -> URL {
        #if DEBUG
        if let address=ProcessInfo.processInfo.environment["AUTHEN_SERVICE_BASE_URL"],
           let base=URL(string:address),
           base.scheme=="https" || (base.scheme=="http" && ["127.0.0.1","localhost"].contains(base.host ?? "")) {
            return base.appendingPathComponent("api").appendingPathComponent(route)
        }
        #endif
        return URL(string:"https://authen.classby.cn/api/")!.appendingPathComponent(route)
    }
}
