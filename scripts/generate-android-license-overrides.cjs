const fs = require('node:fs');
const path = require('node:path');

const rootDirectory = path.resolve(__dirname, '..');
const sourcePath = path.join(
  rootDirectory,
  'licenses',
  'android-license-overrides.source.json',
);
const outputPath = path.join(
  rootDirectory,
  'licenses',
  'android-license-overrides.json',
);

const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
if (source.schemaVersion !== 1 || !Array.isArray(source.packages)) {
  throw new Error('Expected Android license override schema version 1.');
}

const packages = source.packages
  .map(item => {
    const textPath = path.resolve(rootDirectory, item.licenseTextFile);
    const reviewedRoot = path.resolve(rootDirectory, 'licenses', 'reviewed');
    if (!textPath.startsWith(`${reviewedRoot}${path.sep}`)) {
      throw new Error(
        `Android license text must stay under licenses/reviewed: ${item.name}`,
      );
    }
    if (!fs.existsSync(textPath)) {
      throw new Error(`Android license text is missing: ${textPath}`);
    }
    const text = fs
      .readFileSync(textPath, 'utf8')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n')
      .replace(/\n*$/, '\n');
    return {
      name: item.name,
      version: item.version,
      license: item.license,
      repository: item.repository,
      overrideReason: item.reason,
      licenseFiles: [{file: item.source, text}],
      noticeFiles: [],
    };
  })
  .sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );

fs.writeFileSync(
  outputPath,
  `${JSON.stringify({schemaVersion: 1, packages}, null, 2)}\n`,
);
