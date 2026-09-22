jest.mock('@react-native-async-storage/async-storage');

jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn(),
  getGenericPassword: jest.fn(),
  resetGenericPassword: jest.fn(),
}));

import {readFileSync, readdirSync} from 'fs';
import {join, resolve} from 'path';
import ClientCertificateManager from '../../helpers/clientCertificates';

const sourceFilesBelow = (directory: string): string[] =>
  readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const entryPath = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFilesBelow(entryPath)
      : /\.(m|mm|swift)$/.test(entry.name)
      ? [entryPath]
      : [];
  });

describe('ClientCertificateManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not enumerate or expose certificates', () => {
    const manager = new ClientCertificateManager();

    expect(manager).not.toHaveProperty('listCertificates');
    expect(manager).not.toHaveProperty('getCertificateDetails');
    expect(manager).not.toHaveProperty('getDaysUntilExpiry');
  });

  it('reports an empty alias as unavailable without invoking native code', async () => {
    const manager = new ClientCertificateManager();

    await expect(manager.checkCertificateAvailability('')).resolves.toEqual({
      exists: false,
      alias: '',
    });
  });

  it('reports whether the native module is available', () => {
    const manager = new ClientCertificateManager();

    expect(typeof manager.isAvailable()).toBe('boolean');
  });

  it('keeps global React Native trust-all challenge handlers out of the iOS tree and target', () => {
    const iosDirectory = resolve(__dirname, '../../ios/FrigateViewer');
    const project = readFileSync(
      resolve(__dirname, '../../ios/FrigateViewer.xcodeproj/project.pbxproj'),
      'utf8',
    );
    const nativeSources = sourceFilesBelow(iosDirectory)
      .map(file => readFileSync(file, 'utf8'))
      .join('\n');

    expect(project).not.toMatch(/RCHTTPRequestHandler\+ignoreSSL/);
    expect(nativeSources).not.toMatch(
      /@implementation\s+RCTHTTPRequestHandler\s*\([^)]*\)[\s\S]*credentialForTrust\s*:\s*challenge\.protectionSpace\.serverTrust/,
    );
    expect(nativeSources).not.toMatch(/URLCredential\s*\(\s*trust\s*:/);
  });
});