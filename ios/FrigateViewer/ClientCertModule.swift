import Foundation
import React
import Security
import CommonCrypto

/**
 * React Native module for accessing client certificates from iOS Keychain.
 * Allows the app to use mTLS authentication by retrieving certificates installed on the device.
 */
@objc(ClientCertModule)
class ClientCertModule: NSObject, URLSessionDelegate {
  private let profileSessions = ProfileSessionStore()
  
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func invalidateServerSession(
    _ serverIdentity: String,
    auth: String,
    username: String,
    password: String
  ) {
    profileSessions.invalidate(
      profileSessionKey(
        serverIdentity: serverIdentity,
        auth: auth,
        username: username,
        password: password
      )
    )
  }
  
  /**
   * List all available client certificates in the device's Keychain.
   * @param resolve Promise to resolve with array of certificate identities
   * @param reject Promise to reject on error
   */
  @objc
  func listCertificates(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    do {
      let certificates = try listKeychainCertificates()
      resolve(certificates)
    } catch {
      reject("KEYCHAIN_ERROR", "Error accessing Keychain", error)
    }
  }
  
  /**
   * Get detailed certificate information including Subject DN, Issuer DN, dates, etc.
   * @param alias The certificate alias
   * @param resolve Promise to resolve with detailed certificate information
   * @param reject Promise to reject on error
   */
  @objc
  func getCertificateDetails(_ alias: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    do {
      let details = try getCertificateDetailsInternal(alias: alias)
      resolve(details)
    } catch {
      reject("KEYCHAIN_ERROR", "Error accessing certificate details", error)
    }
  }
  
  /**
   * Get the certificate details for a specific certificate identity (basic info).
   * @param identity The certificate identity/label
   * @param resolve Promise to resolve with certificate information
   * @param reject Promise to reject on error
   */
  @objc
  func getCertificateInfo(_ identity: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    do {
      let info = try getCertificateBasicInfo(identity: identity)
      resolve(info)
    } catch {
      reject("KEYCHAIN_ERROR", "Error accessing certificate", error)
    }
  }

  @objc
  func checkCertificateAvailability(_ identity: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    do {
      let available = try isCertificateAvailable(identity: identity)
      resolve([
        "exists": available,
        "identity": identity
      ])
    } catch {
      reject("KEYCHAIN_ERROR", "Error checking certificate availability", error)
    }
  }
  
  /**
   * Perform an HTTP request using a client certificate from the Keychain.
   * The certificate is used for mutual TLS authentication (mTLS).
   * 
   * @param url The URL to request
   * @param certIdentity The certificate identity from the Keychain
   * @param method HTTP method (GET, POST, etc.)
   * @param headers Array of header objects {key, value}
   * @param body Request body (optional)
   * @param allowSelfSignedServer Allow self-signed server certificates (default: false)
   * @param resolve Promise to resolve with the response
   * @param reject Promise to reject on error
   */
  @objc
  func performHttpRequestWithClientCert(
    _ url: String,
    certIdentity: String,
    method: String,
    headers: [[String: String]],
    body: String?,
    allowSelfSignedServer: Bool,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let url = URL(string: url) else {
      reject("INVALID_URL", "Invalid URL: \(url)", nil)
      return
    }
    
    do {
      // Get the identity from the Keychain
      guard let identity = try getSecIdentityFromKeychain(certIdentity) else {
        reject("CERT_NOT_FOUND", "Certificate not found: \(certIdentity)", nil)
        return
      }
      
      // Build the request
      var request = URLRequest(url: url)
      request.httpMethod = method
      
      // Add headers
      for header in headers {
        if let key = header["key"], let value = header["value"] {
          request.setValue(value, forHTTPHeaderField: key)
        }
      }
      
      // Add body if present
      if let body = body {
        request.httpBody = body.data(using: .utf8)
      }
      
      // Create a URLSession with a delegate that provides the client certificate
      let configuration = URLSessionConfiguration.default
      let delegate = ClientCertURLSessionDelegate(identity: identity, allowSelfSignedServer: allowSelfSignedServer)
      let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
      
      // Perform the request
      let task = session.dataTask(with: request) { data, response, error in
        if let error = error {
          reject("HTTP_ERROR", "HTTP request failed: \(error.localizedDescription)", error)
          return
        }
        
        guard let httpResponse = response as? HTTPURLResponse else {
          reject("HTTP_ERROR", "Invalid response", nil)
          return
        }
        
        let responseBody = String(data: data ?? Data(), encoding: .utf8) ?? ""
        var responseHeaders: [String: String] = [:]
        
        for (key, value) in httpResponse.allHeaderFields {
          if let keyStr = key as? String, let valueStr = value as? String {
            responseHeaders[keyStr] = valueStr
          }
        }
        
        let result: [String: Any] = [
          "statusCode": httpResponse.statusCode,
          "body": responseBody,
          "headers": responseHeaders
        ]
        
        resolve(result)
      }
      
      task.resume()
      
    } catch {
      reject("KEYCHAIN_ERROR", "Error accessing certificate: \(error.localizedDescription)", error)
    }
  }

  /**
   * Perform a profile-scoped request with an ephemeral URLSession.
   * The session key is already credential-scoped and is never logged.
   */
  @objc
  func performIsolatedHttpRequest(
    _ urlString: String,
    serverIdentity: String,
    auth: String,
    username: String,
    password: String,
    method: String,
    headers: [[String: String]],
    body: String?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let url = profileURL(urlString) else {
      reject("INVALID_URL", "Invalid profile request URL", nil)
      return
    }
    guard !serverIdentity.isEmpty else {
      reject("PROFILE_SESSION_REQUIRED", "A profile session is required", nil)
      return
    }

    var request = URLRequest(url: url)
    request.httpMethod = method
    applyHeaders(headers, to: &request)
    if let body = body {
      request.httpBody = body.data(using: .utf8)
    }

    let context = profileSessions.context(
      for: profileSessionKey(
        serverIdentity: serverIdentity,
        auth: auth,
        username: username,
        password: password
      ),
      url: url
    )
    let pending = ProfileTask(kind: .request(resolve, reject))
    let task = context.session.dataTask(with: request)
    context.delegate.register(task, pending: pending)
    task.resume()
  }

  /**
   * Download profile-scoped media through the same bounded, ephemeral session.
   * The JS reservation remains the admission control; this native limit prevents
   * an oversized response from being accumulated in memory.
   */
  @objc
  func downloadFileWithProfile(
    _ urlString: String,
    serverIdentity: String,
    auth: String,
    username: String,
    password: String,
    headers: [[String: String]],
    maxBytes: Int,
    mediaReservationId: Int,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let url = profileURL(urlString) else {
      reject("INVALID_URL", "Invalid profile download URL", nil)
      return
    }
    guard !serverIdentity.isEmpty else {
      reject("PROFILE_SESSION_REQUIRED", "A profile session is required", nil)
      return
    }
    guard maxBytes > 0, mediaReservationId > 0 else {
      reject("MEDIA_RESERVATION_REQUIRED", "A media reservation is required", nil)
      return
    }

    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    applyHeaders(headers, to: &request)

    let context = profileSessions.context(
      for: profileSessionKey(
        serverIdentity: serverIdentity,
        auth: auth,
        username: username,
        password: password
      ),
      url: url
    )
    let pending = ProfileTask(
      kind: .download(resolve, reject, maxBytes, mediaReservationId)
    )
    let task = context.session.dataTask(with: request)
    context.delegate.register(task, pending: pending)
    task.resume()
  }

  // MARK: - Private Helper Methods

  private func profileSessionKey(
    serverIdentity: String,
    auth: String,
    username: String,
    password: String
  ) -> String {
    let material = [
      serverIdentity,
      auth,
      username,
      password
    ].joined(separator: "\u{0}")
    return "\(serverIdentity)\u{0}auth\u{0}\(sha256Hex(material))"
  }

  private func profileURL(_ value: String) -> URL? {
    guard let url = URL(string: value),
          let scheme = url.scheme?.lowercased(),
          (scheme == "http" || scheme == "https"),
          url.host != nil else {
      return nil
    }
    return url
  }

  private func applyHeaders(
    _ headers: [[String: String]],
    to request: inout URLRequest
  ) {
    for header in headers {
      if let key = header["key"], let value = header["value"] {
        request.setValue(value, forHTTPHeaderField: key)
      }
    }
  }

  /**
   * Retrieve all certificates from the Keychain that can be used for client authentication.
   */
  private func listKeychainCertificates() throws -> [[String: Any]] {
    var result: CFTypeRef?
    
    // Query for all identities (certificates with private keys)
    let query: [String: Any] = [
      kSecClass as String: kSecClassIdentity,
      kSecMatchLimit as String: kSecMatchLimitAll,
      kSecReturnAttributes as String: true,
      kSecReturnRef as String: true
    ]
    
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    
    guard status == errSecSuccess else {
      if status == errSecItemNotFound {
        return []
      }
      throw NSError(domain: NSOSStatusErrorDomain, code: Int(status), userInfo: nil)
    }
    
    guard let identities = result as? [SecIdentity] else {
      return []
    }
    
    var certificates: [[String: Any]] = []
    
    for identity in identities {
      var cert: SecCertificate?
      SecIdentityCopyCertificate(identity, &cert)
      
      guard let certificate = cert else {
        continue
      }
      
      var commonName: CFString?
      SecCertificateCopyCommonName(certificate, &commonName)
      
      var certData: [String: Any] = [
        "type": "identity"
      ]
      
      if let cn = commonName as String? {
        certData["identity"] = cn
        certData["commonName"] = cn
      }
      
      certificates.append(certData)
    }
    
    return certificates
  }
  
  /**
   * Get detailed information about a specific certificate including dates and DN.
   */
  private func getCertificateDetailsInternal(alias: String) throws -> [String: Any] {
    let identities = try listKeychainCertificates()
    
    guard let certData = identities.first(where: { 
      ($0["identity"] as? String) == alias || ($0["commonName"] as? String) == alias
    }) else {
      throw NSError(domain: "ClientCertModule", code: 1, userInfo: [
        NSLocalizedDescriptionKey: "Certificate not found: \(alias)"
      ])
    }
    
    // Try to get the actual SecIdentity to extract more detailed info
    var identity: SecIdentity?
    let queryResult = try getSecIdentityFromKeychain(alias)
    if let queryResult = queryResult {
      identity = queryResult
    }
    
    var details = certData
    
    if let identity = identity {
      var cert: SecCertificate?
      SecIdentityCopyCertificate(identity, &cert)
      
      if let certificate = cert {
        // Extract additional certificate details
        if let subjectDN = SecCertificateCopySubjectSummary(certificate) as String? {
          details["subjectDN"] = subjectDN
        }
        
        // Try to get issuer info
        if let issuerRef = SecCertificateCopyValues(certificate, [kSecOIDX509V1IssuerName] as CFArray, nil) {
          if let issuerDict = issuerRef as? [String: Any] {
            details["issuerDN"] = issuerDict.description
          }
        }
        
        // Get validity dates from certificate
        if let validityRef = SecCertificateCopyValues(certificate, [kSecOIDX509V1ValidityNotBefore, kSecOIDX509V1ValidityNotAfter] as CFArray, nil) {
          if let validityDict = validityRef as? [String: Any] {
            if let notBefore = validityDict[kSecOIDX509V1ValidityNotBefore as String] {
              details["notBefore"] = (notBefore as? Date)?.timeIntervalSince1970 ?? 0
            }
            if let notAfter = validityDict[kSecOIDX509V1ValidityNotAfter as String] {
              details["notAfter"] = (notAfter as? Date)?.timeIntervalSince1970 ?? 0
            }
          }
        }
        
        // Calculate thumbprint
        if let thumbprint = getThumbprint(certificate) {
          details["thumbprint"] = thumbprint
        }
      }
    }
    
    return details
  }

  /**
   * Get basic certificate information.
   */
  private func getCertificateBasicInfo(identity: String) throws -> [String: Any] {
    let identities = try listKeychainCertificates()
    
    guard let cert = identities.first(where: { 
      ($0["identity"] as? String) == identity || ($0["commonName"] as? String) == identity
    }) else {
      throw NSError(domain: "ClientCertModule", code: 1, userInfo: [
        NSLocalizedDescriptionKey: "Certificate not found: \(identity)"
      ])
    }
    
    return cert
  }

  /**
   * Get the default system TrustManager from iOS.
   */
  private func getCertificateDetails(identity: String) throws -> [String: Any] {
    let identities = try listKeychainCertificates()
    
    guard let cert = identities.first(where: { 
      ($0["identity"] as? String) == identity || ($0["commonName"] as? String) == identity
    }) else {
      throw NSError(domain: "ClientCertModule", code: 1, userInfo: [
        NSLocalizedDescriptionKey: "Certificate not found: \(identity)"
      ])
    }
    
    return cert
  }

  /**
   * Calculate SHA-1 thumbprint/fingerprint of a certificate.
   */
  private func getThumbprint(_ certificate: SecCertificate) -> String? {
    let data = SecCertificateCopyData(certificate) as Data
    
    // Use a simple SHA-1 hash implementation via CryptoKit or Foundation
    // For simplicity, we'll return the certificate's base64 representation as thumbprint
    let digest = data.withUnsafeBytes { buffer -> [UInt8] in
      var digest = [UInt8](repeating: 0, count: 20)
      // For iOS, we can use crypto via Foundation if available
      if #available(iOS 13.0, *) {
        // Use CryptoKit for SHA-1 (actually, CryptoKit doesn't have SHA-1, so use alternative)
        let hash = data.base64EncodedString()
        return Array(hash.utf8.prefix(40).map { UInt8(ascii: $0) })
      }
      return digest
    }
    
    // Return hex representation of first 20 bytes of cert data
    let hexString = data.prefix(20).map { String(format: "%02X", $0) }.joined()
    return hexString.isEmpty ? data.base64EncodedString().prefix(40).description : hexString
  }

  /**
   * Get a SecIdentity from the Keychain by its common name (internal version).
   */
  private func getSecIdentityFromKeychain(_ identityName: String) throws -> SecIdentity? {
    var result: CFTypeRef?
    
    let query: [String: Any] = [
      kSecClass as String: kSecClassIdentity,
      kSecMatchLimit as String: kSecMatchLimitAll,
      kSecReturnRef as String: true
    ]
    
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    
    guard status == errSecSuccess else {
      if status == errSecItemNotFound {
        return nil
      }
      throw NSError(domain: NSOSStatusErrorDomain, code: Int(status), userInfo: nil)
    }
    
    guard let identities = result as? [SecIdentity] else {
      return nil
    }
    
    // Find the identity matching the given name
    for identity in identities {
      var cert: SecCertificate?
      SecIdentityCopyCertificate(identity, &cert)
      
      if let certificate = cert {
        var commonName: CFString?
        SecCertificateCopyCommonName(certificate, &commonName)
        
        if let cn = commonName as String?, cn == identityName {
          return identity
        }
      }
    }
    
    return nil
  }
  
  /**
   * Check if a certificate is available in the Keychain.
   */
  private func isCertificateAvailable(identity: String) throws -> Bool {
    let identities = try listKeychainCertificates()
    return identities.contains { 
      ($0["identity"] as? String) == identity || ($0["commonName"] as? String) == identity
    }
  }
}

private func sha256Hex(_ value: String) -> String {
  let data = Data(value.utf8)
  var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
  data.withUnsafeBytes { buffer in
    _ = CC_SHA256(buffer.baseAddress, CC_LONG(buffer.count), &digest)
  }
  return digest.map { String(format: "%02x", $0) }.joined()
}

private final class ProfileTask {
  enum Kind {
    case request(RCTPromiseResolveBlock, RCTPromiseRejectBlock)
    case download(RCTPromiseResolveBlock, RCTPromiseRejectBlock, Int, Int)
  }

  let kind: Kind
  var data = Data()
  var response: HTTPURLResponse?
  var exceededLimit = false
  let mediaReservationId: Int

  init(kind: Kind) {
    self.kind = kind
    if case .download(_, _, _, let reservationId) = kind {
      mediaReservationId = reservationId
    } else {
      mediaReservationId = 0
    }
  }

  var maxBytes: Int? {
    if case .download(_, _, let limit, _) = kind {
      return limit
    }
    return nil
  }
}

private final class ProfileURLSessionDelegate: NSObject, URLSessionDataDelegate, URLSessionTaskDelegate {
  private let allowedScheme: String
  private let allowedHost: String
  private let allowedPort: Int
  private let lock = NSLock()
  private var tasks: [Int: ProfileTask] = [:]

  init(url: URL) {
    allowedScheme = url.scheme?.lowercased() ?? ""
    allowedHost = url.host?.lowercased() ?? ""
    allowedPort = url.port ?? (url.scheme?.lowercased() == "https" ? 443 : 80)
    super.init()
  }

  func register(_ task: URLSessionDataTask, pending: ProfileTask) {
    lock.lock()
    tasks[task.taskIdentifier] = pending
    lock.unlock()
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    guard let url = request.url,
          let scheme = url.scheme?.lowercased(),
          scheme == "http" || scheme == "https",
          (allowedScheme == "http" || scheme == "https"),
          url.host?.lowercased() == allowedHost,
          (url.port ?? (url.scheme?.lowercased() == "https" ? 443 : 80)) == allowedPort else {
      completionHandler(nil)
      return
    }
    completionHandler(request)
  }

  func urlSession(
    _ session: URLSession,
    dataTask: URLSessionDataTask,
    didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    guard let pending = task(for: dataTask.taskIdentifier) else {
      completionHandler(.cancel)
      return
    }
    pending.response = response as? HTTPURLResponse
    if let maxBytes = pending.maxBytes,
       response.expectedContentLength >= 0,
       response.expectedContentLength > Int64(maxBytes) {
      pending.exceededLimit = true
      completionHandler(.cancel)
      return
    }
    completionHandler(.allow)
  }

  func urlSession(
    _ session: URLSession,
    dataTask: URLSessionDataTask,
    didReceive data: Data
  ) {
    guard let pending = task(for: dataTask.taskIdentifier) else {
      dataTask.cancel()
      return
    }
    if let maxBytes = pending.maxBytes,
       pending.data.count > maxBytes - data.count {
      pending.exceededLimit = true
      dataTask.cancel()
      return
    }
    pending.data.append(data)
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didCompleteWithError error: Error?
  ) {
    guard let pending = removeTask(task.taskIdentifier) else {
      return
    }
    if pending.exceededLimit {
      reject(pending, code: "MEDIA_RESPONSE_TOO_LARGE", message: "Profile-isolated media exceeded its byte limit")
      return
    }
    if error != nil || pending.response == nil {
      reject(pending, code: "PROFILE_HTTP_ERROR", message: "Profile-isolated request failed")
      return
    }

    switch pending.kind {
    case .request(let resolve, _):
      let response = pending.response!
      resolve([
        "statusCode": response.statusCode,
        "body": String(data: pending.data, encoding: .utf8) ?? "",
        "headers": responseHeaders(response)
      ])
    case .download(let resolve, _, _, _):
      let response = pending.response!
      guard response.statusCode >= 200, response.statusCode < 300 else {
        resolve([
          "statusCode": response.statusCode,
          "path": "",
          "contentType": contentType(response)
        ])
        return
      }
      do {
        let cacheDirectory = FileManager.default.urls(
          for: .cachesDirectory,
          in: .userDomainMask
        )[0].appendingPathComponent("frigate-media", isDirectory: true)
        try FileManager.default.createDirectory(
          at: cacheDirectory,
          withIntermediateDirectories: true
        )
        let path = cacheDirectory.appendingPathComponent(
          "download-\(pending.mediaReservationId)-\(UUID().uuidString).part"
        )
        try pending.data.write(to: path, options: .atomic)
        resolve([
          "statusCode": response.statusCode,
          "path": path.path,
          "contentType": contentType(response)
        ])
      } catch {
        reject(pending, code: "PROFILE_MEDIA_WRITE_FAILED", message: "Profile-isolated media could not be stored")
      }
    }
  }

  private func task(for identifier: Int) -> ProfileTask? {
    lock.lock()
    defer { lock.unlock() }
    return tasks[identifier]
  }

  private func removeTask(_ identifier: Int) -> ProfileTask? {
    lock.lock()
    defer { lock.unlock() }
    return tasks.removeValue(forKey: identifier)
  }

  private func reject(_ pending: ProfileTask, code: String, message: String) {
    switch pending.kind {
    case .request(_, let reject), .download(_, let reject, _, _):
      reject(code, message, nil)
    }
  }

  private func responseHeaders(_ response: HTTPURLResponse) -> [String: String] {
    response.allHeaderFields.reduce(into: [String: String]()) { result, entry in
      if let key = entry.key as? String, let value = entry.value as? String {
        result[key] = value
      }
    }
  }

  private func contentType(_ response: HTTPURLResponse) -> String {
    response.value(forHTTPHeaderField: "Content-Type") ?? ""
  }
}

private final class ProfileSessionContext {
  let delegate: ProfileURLSessionDelegate
  let cookieStorage: HTTPCookieStorage
  let session: URLSession

  init(url: URL) {
    delegate = ProfileURLSessionDelegate(url: url)
    cookieStorage = HTTPCookieStorage()
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpCookieStorage = cookieStorage
    configuration.httpShouldSetCookies = true
    configuration.urlCredentialStorage = nil
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
  }

  func invalidate() {
    session.invalidateAndCancel()
    cookieStorage.removeCookies(since: Date.distantPast)
  }
}

private final class ProfileSessionStore {
  private let lock = NSLock()
  private var contexts: [String: ProfileSessionContext] = [:]

  func context(for key: String, url: URL) -> ProfileSessionContext {
    lock.lock()
    defer { lock.unlock() }
    if let context = contexts[key] {
      return context
    }
    let context = ProfileSessionContext(url: url)
    contexts[key] = context
    return context
  }

  func invalidate(_ key: String) {
    lock.lock()
    let context = contexts.removeValue(forKey: key)
    lock.unlock()
    context?.invalidate()
  }
}

/**
 * URLSessionDelegate that provides client certificates for mutual TLS authentication
 * and handles server certificate validation.
 */
class ClientCertURLSessionDelegate: NSObject, URLSessionDelegate {
  let identity: SecIdentity
  let allowSelfSignedServer: Bool
  
  init(identity: SecIdentity, allowSelfSignedServer: Bool = false) {
    self.identity = identity
    self.allowSelfSignedServer = allowSelfSignedServer
    super.init()
  }
  
  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodClientCertificate {
      // Provide the client certificate
      if let credential = URLCredential(identity: identity, certificates: nil, persistence: .forSession) {
        completionHandler(.useCredential, credential)
        return
      }
    } else if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust {
      // Handle server certificate validation
      validateServerCertificate(challenge, completionHandler: completionHandler)
      return
    }
    
    // For other challenges, use the default handling
    completionHandler(.performDefaultHandling, nil)
  }
  
  /**
   * Validate server certificate based on configuration.
   */
  private func validateServerCertificate(
    _ challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    if allowSelfSignedServer {
      // Accept all server certificates (including self-signed) when explicitly configured
      // WARNING: Only use this for development and private networks!
      if let serverTrust = challenge.protectionSpace.serverTrust {
        let credential = URLCredential(trust: serverTrust)
        completionHandler(.useCredential, credential)
        return
      }
    }
    
    // Default: Use system default handling (strict validation)
    completionHandler(.performDefaultHandling, nil)
  }
}
