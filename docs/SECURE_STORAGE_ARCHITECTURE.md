# Secure Storage Architecture (Phase 9)

## Overview

This document describes the centralized Secure Storage Abstraction Layer implemented in Phase 9. It provides a unified interface for secure credential and sensitive data storage across iOS and Android platforms, with graceful fallback to AsyncStorage for development environments.

## Architecture

### Core Components

```
┌─────────────────────────────────────────────┐
│        Application Layer (UI/Logic)         │
│   (uses secureStorage.ts public API)        │
└─────────────────┬───────────────────────────┘
                  │
        ┌─────────┴──────────┐
        │                    │
┌───────▼──────────┐  ┌──────▼───────────┐
│ secureStorage.ts │  │   StorageProvider│
│  (Public API)    │  │    (Abstraction) │
└───────┬──────────┘  └──────┬───────────┘
        │                    │
        └─────────┬──────────┘
                  │
        ┌─────────┴──────────┬──────────────┐
        │                    │              │
┌───────▼──────────┐ ┌──────▼────────┐  ┌─▼────────────┐
│  iOS Keychain    │ │Android Keystore│ │ AsyncStorage │
│   Provider       │ │   Provider     │ │  Fallback    │
└──────────────────┘ └────────────────┘ └──────────────┘
        │                    │                    │
└───────┴──────────┬─────────┴──────────────────┘
                   │
        ┌──────────▼───────────┐
        │  Native Storage      │
        │  (Keychain/Keystore) │
        └──────────────────────┘
```

## Storage Providers

### 1. iOS Keychain Provider (`KeychainStorageProvider`)

**Features:**

- Uses native iOS Keychain framework
- Hardware-backed encryption (Secure Enclave when available)
- Automatic backup exclusion capability
- Biometric/Face ID access control support

**Security:**

- Data encrypted with AES-256
- Protected by device passcode/Face ID/Touch ID
- Cannot be accessed outside app context
- Not backed up to cloud unless explicitly enabled

**Configuration:**

```typescript
interface StorageOptions {
  service?: string; // e.g., 'com.frigate.viewer'
  accessible?: 'whenUnlocked' | 'whenUnlockedThisDeviceOnly';
  sensitive?: boolean; // For highly sensitive data
}
```

### 2. Android Keystore Provider (`KeystoreStorageProvider`)

**Features:**

- Uses native Android Keystore system
- Hardware-backed encryption when available
- AES encryption with configurable parameters
- Biometric access control support

**Security:**

- Data encrypted with AES-256 in CBC mode
- Protected by device lock (PIN/Pattern/Biometric)
- Hardware-backed when Trusted Execution Environment (TEE) available
- Bound to device, cannot be extracted

**Configuration:**

- Storage type: AES (STORAGE_TYPE.AES)
- Accessibility: WHEN_UNLOCKED
- Service identifier: device-specific

### 3. AsyncStorage Fallback Provider (`AsyncStorageProvider`)

**Features:**

- React Native built-in storage
- Works in development environments
- No native module dependencies

**Security Limitations:**

- ⚠️ **NOT SECURE** - Data stored in plain text
- Use only for development/testing
- Never store sensitive credentials

**Use Case:**

- Development environments
- Fallback when native modules unavailable
- Testing scenarios

## Public API

### Main secureStorage.ts Exports

#### Credentials Management

```typescript
// Save credentials
export const saveCredentials = async (
  serverUrl: string,
  credentials: Credentials
): Promise<void>

// Load credentials
export const loadCredentials = async (
  serverUrl: string
): Promise<Credentials | null>

// Remove credentials
export const removeCredentials = async (
  serverUrl: string
): Promise<void>
```

#### Certificate Password Management (RAM Cache)

```typescript
// Save certificate password (RAM only)
export const saveCertificatePassword = async (
  serverId: string,
  password: string
): Promise<void>

// Load certificate password
export const loadCertificatePassword = async (
  serverId: string
): Promise<string | null>

// Clear specific certificate password
export const clearCertificatePassword = async (
  serverId: string
): Promise<void>

// Clear all certificate passwords
export const clearAllCertPasswords = (): void
```

#### Migration & Initialization

```typescript
// Migrate old AsyncStorage credentials to Keychain/Keystore
export const migrateAsyncStorageCredentials = async (): Promise<void>

// Initialize secure storage on app startup
export const initializeSecureStorage = async (): Promise<void>
```

#### Platform Detection

```typescript
// Get current platform
export const getPlatform = (): 'ios' | 'android' | 'unknown'
```

## Security Best Practices

### 1. Certificate Passwords

**Important:** Certificate passwords are stored ONLY in RAM, not persisted:

- Cleared when app closes
- Cleared on memory pressure
- Not recoverable after app termination
- Automatically cleared on logout

**Usage Pattern:**

```typescript
// 1. User enters password
const password = getUserInput();

// 2. Store in RAM cache for current session
await saveCertificatePassword(serverId, password);

// 3. Use for authentication throughout session
const certPassword = await loadCertificatePassword(serverId);

// 4. Clear on logout/session end
await clearCertificatePassword(serverId);
```

### 2. Credential Storage

**Best Practices:**

1. Always use `saveCredentials()` for user credentials
2. Automatic encryption via native platform
3. Never log passwords or sensitive data
4. Clear credentials on logout
5. Use HTTPS for credential transmission

```typescript
// ✓ Good
const creds = {username: 'user@example.com', password};
await saveCredentials(serverUrl, creds);

// ✗ Bad
console.log(credentials); // Never log sensitive data
localStorage.setItem('password', password); // Never plaintext
```

### 3. Access Control

**Multi-layered Protection:**

1. **Device Level:**

   - Passcode/Biometric unlock required
   - Device encryption (FileVault on iOS, full disk on Android)

2. **App Level:**

   - No background execution with access
   - Memory cleared on app termination
   - No clipboard usage for sensitive data

3. **Network Level:**
   - HTTPS only for credential transmission
   - Certificate pinning for API calls
   - Secure token refresh mechanism

### 4. Migration from Old Storage

**Automatic Migration:**

```typescript
// Called on app initialization
await initializeSecureStorage();
// This automatically:
// 1. Detects old AsyncStorage credentials
// 2. Migrates to Keychain/Keystore
// 3. Removes old plaintext data
```

**Manual Migration (if needed):**

```typescript
const oldCreds = await AsyncStorage.getItem('frigate_server1');
if (oldCreds) {
  const credentials = JSON.parse(oldCreds);
  await saveCredentials('server1', credentials);
  await AsyncStorage.removeItem('frigate_server1');
}
```

## Platform-Specific Details

### iOS Keychain

**Key Properties:**

- Service Identifier: `com.frigate.viewer`
- Accessibility Level: `whenUnlocked` (default) or `whenUnlockedThisDeviceOnly`
- Key Format: `frigate_<key_name>`

**Example Flow:**

```
User Login
    ↓
saveCredentials('https://frigate.local', {username, password})
    ↓
React Native Keychain Module
    ↓
Native Keychain Framework
    ↓
Secure Enclave (if available)
    ↓
Encrypted Data Storage
```

### Android Keystore

**Key Properties:**

- Service Identifier: `com.frigate.viewer`
- Encryption Algorithm: AES/CBC/PKCS7Padding
- Key Protection: Hardware-backed when available
- Key Format: `frigate_<key_name>`

**Example Flow:**

```
User Login
    ↓
saveCredentials('https://frigate.local', {username, password})
    ↓
React Native Keychain Module
    ↓
Android Keystore System
    ↓
TEE/Hardware (if available) or Software Crypto
    ↓
Encrypted Data Storage
```

## Migration Strategy

### Phase 0: Pre-Migration

- Existing credentials in AsyncStorage (from Phase 1)
- Less secure, plaintext data
- Used in development environments

### Phase 1-8: Interim

- AsyncStorage still used
- Phase 9 provides fallback support

### Phase 9: Migration

- Automatic detection on app startup
- Credentials automatically moved to Keychain/Keystore
- Old AsyncStorage data removed
- Zero user intervention required

### Post-Migration

- All new data uses Keychain/Keystore
- AsyncStorage used only as fallback
- Can optionally clear old AsyncStorage entirely

### Rollback Strategy

If needed to rollback:

```typescript
// 1. Detect migration happened
// 2. Export encrypted credentials
// 3. Save back to AsyncStorage
// 4. Notify user of security downgrade
```

## Testing

### Unit Tests

Located in:

- `__tests__/helpers/secureStorage.test.ts`
- `__tests__/helpers/StorageProvider.test.ts`

**Test Coverage:**

- Certificate password RAM cache operations
- Migration from AsyncStorage
- Platform detection
- Storage provider initialization
- Error handling
- Backward compatibility

### Test Execution

```bash
# Run secure storage tests
npm test -- secureStorage.test.ts

# Run storage provider tests
npm test -- StorageProvider.test.ts

# Run all tests
npm test
```

## Error Handling

### Common Scenarios

#### Keychain Unavailable

```typescript
// Automatically falls back to AsyncStorage
// Logs warning but continues functioning
try {
  await saveCredentials(serverUrl, credentials);
} catch (error) {
  // Logged and handled gracefully
}
```

#### Storage Full

- iOS Keychain: Handled by system (rare)
- Android Keystore: Handled by system (rare)
- AsyncStorage: May raise error, logged and reported

#### Biometric Enrollment Changes

- iOS: Keychain data remains accessible
- Android: Keystore invalidates on biometric change (expected)

#### App Uninstall

- iOS: All Keychain data deleted
- Android: All Keystore data deleted
- AsyncStorage: Data persists (use `clear()` if needed)

## Performance Characteristics

### Operation Latencies (typical)

| Operation | iOS Keychain | Android Keystore | AsyncStorage |
| --------- | ------------ | ---------------- | ------------ |
| Save      | 10-50ms      | 20-100ms         | 5-10ms       |
| Load      | 10-50ms      | 20-100ms         | 5-10ms       |
| Remove    | 5-20ms       | 10-50ms          | 5-10ms       |

### Memory Usage

- **Keychain/Keystore:** Minimal (handled by OS)
- **AsyncStorage:** Proportional to data size
- **RAM Cache (passwords):** Per-item ~100 bytes

### Optimization Tips

1. Load credentials once, cache in app state
2. Avoid repeated storage access in loops
3. Clear unnecessary cached passwords
4. Use batch operations when available

## Logging & Debugging

### Debug Logging

```typescript
// In development, see detailed storage operations
console.log(`Using ${getPlatform()} storage provider`);

// Automatic logs:
// - "Secure storage initialized (Platform: ...)"
// - "Migrated credentials for ... to Keychain"
// - "Using iOS Keychain storage provider"
// - "Using Android Keystore storage provider"
// - "Using AsyncStorage fallback provider"
```

### Disable Sensitive Logging

Never log:

- Passwords
- Tokens
- API keys
- Credential objects (use `[REDACTED]` instead)

## Future Enhancements

1. **Biometric Authentication Integration**

   - Face ID / Touch ID requirement for credential access
   - Configurable biometric unlock policies

2. **Hardware Security Module (HSM) Support**

   - Enterprise deployments
   - Additional encryption layers

3. **Backup/Restore Encryption**

   - Encrypted backup to cloud storage
   - Secure key management for backup

4. **Audit Logging**

   - Track credential access
   - Detect unauthorized access attempts
   - GDPR/compliance reporting

5. **Key Rotation**
   - Automatic periodic key rotation
   - Automatic re-encryption of old data

## Troubleshooting

### Credentials Lost After App Update

- Expected behavior: Keychain/Keystore cleared on reinstall
- Solution: Re-authenticate with server

### Credentials Lost on Device Lock

- Check Keychain/Keystore accessibility settings
- Ensure `WHEN_UNLOCKED` is configured correctly
- Verify device is not in recovery mode

### Performance Degradation

- Clear old certificates/credentials
- Check device storage space
- Review RAM cache size

### Migration Issues

- Check AsyncStorage has permissions
- Verify Keychain/Keystore available
- Check logs for specific errors

## References

- [react-native-keychain Documentation](https://github.com/oblador/react-native-keychain)
- [iOS Keychain Services](https://developer.apple.com/documentation/security/keychain)
- [Android Keystore System](https://developer.android.com/training/articles/keystore)
- [React Native AsyncStorage](https://github.com/react-native-async-storage/async-storage)
- [OWASP Mobile Security](https://owasp.org/www-project-mobile-security/)
