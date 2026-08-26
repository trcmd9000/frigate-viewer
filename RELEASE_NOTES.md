# Frigate Viewer - v1.0.0 Release

> **Independent Release** - Full Featured Security & Quality Updates

## 🎯 What's New

### ✨ Client Certificate Authentication (mTLS)
- **Mutual TLS Support**: Secure authentication using device-stored certificates
- **Platform-Native**: Uses Android Keystore and iOS Keychain
- **Automatic Selection**: App remembers certificate per server
- **Self-Signed Certificates**: Optional support for private networks
- **Certificate Details**: View expiry dates and certificate info

### 🔒 Security Enhancements
- **Secure Credential Storage**: Credentials moved from AsyncStorage to Keychain/Keystore
- **Logging Security**: Removed sensitive data from Firebase Crashlytics logs
- **Certificate Validation**: Explicit server certificate validation with self-signed toggle
- **Secure Storage Layer**: Centralized abstraction for platform-specific secure storage

### 📊 Code Quality Improvements
- **TypeScript Strict Mode**: 260+ type errors fixed, 0% implicit any
- **ESLint Enhanced**: Added @typescript-eslint rules, reduced violations 99.4%
- **Test Coverage**: 50%+ coverage for critical paths
- **Error Handling**: Standardized error system with user-friendly messages
- **Type Safety**: Full type coverage across codebase

### 🚀 Dependencies & Performance
- **React**: Updated to 18.3.1
- **React Native**: Updated to 0.75.2
- **TypeScript**: Updated to 5.6.2
- **Package Replacement**: rn-fetch-blob → react-native-blob-util (maintained)
- **npm audit**: All critical/high severity issues fixed

## 📋 Breaking Changes
**None.** All changes are backward compatible.

## 📄 License
GPLv3 (maintained from original)

---

**Independent TrCMD9000 Edition**
