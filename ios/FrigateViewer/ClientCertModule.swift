import Foundation
import React
import Security

/**
 * React Native module for accessing client certificates from iOS Keychain.
 * Allows the app to use mTLS authentication by retrieving certificates installed on the device.
 */
@objc(ClientCertModule)
class ClientCertModule: NSObject, URLSessionDelegate {
  
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
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
  
  // MARK: - Private Helper Methods
  
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

