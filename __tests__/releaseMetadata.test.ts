import fs from 'node:fs';
import path from 'node:path';
import packageMetadata from '../package.json';

describe('release metadata', () => {
  it('keeps the displayed package version aligned with Android versionName', () => {
    const buildGradle = fs.readFileSync(
      path.join(__dirname, '..', 'android', 'app', 'build.gradle'),
      'utf8',
    );
    expect(buildGradle).toContain(
      `versionName "${packageMetadata.version}"`,
    );
  });
});
