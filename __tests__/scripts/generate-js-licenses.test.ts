import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

interface Generator {
  generateCatalog(options: {rootDirectory: string}): {
    packages: Array<{name: string; version: string}>;
  };
}

const {generateCatalog} = require('../../scripts/generate-js-licenses.cjs') as Generator;

const writePackage = (
  root: string,
  name: string,
  metadata: Record<string, unknown>,
  licenseText?: string,
) => {
  const directory = path.join(root, 'node_modules', name);
  fs.mkdirSync(directory, {recursive: true});
  fs.writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({name, version: '1.0.0', ...metadata}),
  );
  if (licenseText) {
    fs.writeFileSync(path.join(directory, 'LICENSE'), licenseText);
  }
};

describe('JavaScript license generator', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'frigate-licenses-'));
    fs.mkdirSync(path.join(root, 'licenses'));
    fs.writeFileSync(
      path.join(root, 'licenses', 'license-overrides.json'),
      '{}',
    );
  });

  afterEach(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('includes production dependencies and excludes root dev dependencies', () => {
    writePackage(root, 'runtime', {license: 'MIT'}, 'MIT license');
    writePackage(root, 'development', {license: 'MIT'}, 'MIT license');
    fs.writeFileSync(
      path.join(root, 'package-lock.json'),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': {
            dependencies: {runtime: '1.0.0'},
            devDependencies: {development: '1.0.0'},
          },
          'node_modules/runtime': {version: '1.0.0', license: 'MIT'},
          'node_modules/development': {
            version: '1.0.0',
            license: 'MIT',
            dev: true,
          },
        },
      }),
    );

    expect(generateCatalog({rootDirectory: root}).packages).toEqual([
      expect.objectContaining({name: 'runtime', version: '1.0.0'}),
    ]);
  });

  it('includes root optional production dependencies', () => {
    writePackage(root, 'runtime-optional', {license: 'MIT'}, 'MIT license');
    fs.writeFileSync(
      path.join(root, 'package-lock.json'),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': {optionalDependencies: {'runtime-optional': '1.0.0'}},
          'node_modules/runtime-optional': {
            version: '1.0.0',
            license: 'MIT',
            optional: true,
          },
        },
      }),
    );

    expect(generateCatalog({rootDirectory: root}).packages).toEqual([
      expect.objectContaining({name: 'runtime-optional', version: '1.0.0'}),
    ]);
  });

  it('fails instead of silently omitting unknown license text', () => {
    writePackage(root, 'runtime', {license: 'Custom-Proprietary'});
    fs.writeFileSync(
      path.join(root, 'package-lock.json'),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': {dependencies: {runtime: '1.0.0'}},
          'node_modules/runtime': {
            version: '1.0.0',
            license: 'Custom-Proprietary',
          },
        },
      }),
    );

    expect(() => generateCatalog({rootDirectory: root})).toThrow(
      /incomplete license catalog[\s\S]*runtime@1\.0\.0: license text/i,
    );
  });

  it('fails when a discovered license file is empty', () => {
    writePackage(root, 'runtime', {license: 'MIT'}, '   ');
    fs.writeFileSync(
      path.join(root, 'package-lock.json'),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': {dependencies: {runtime: '1.0.0'}},
          'node_modules/runtime': {version: '1.0.0', license: 'MIT'},
        },
      }),
    );

    expect(() => generateCatalog({rootDirectory: root})).toThrow(
      /incomplete license catalog[\s\S]*runtime@1\.0\.0: license text \(LICENSE\)/i,
    );
  });

  it('deduplicates identical packages installed at multiple paths', () => {
    writePackage(root, 'runtime', {license: 'MIT'}, 'MIT license');
    const nestedDirectory = path.join(
      root,
      'node_modules',
      'parent',
      'node_modules',
      'runtime',
    );
    fs.mkdirSync(nestedDirectory, {recursive: true});
    fs.writeFileSync(
      path.join(nestedDirectory, 'package.json'),
      JSON.stringify({name: 'runtime', version: '1.0.0', license: 'MIT'}),
    );
    fs.writeFileSync(path.join(nestedDirectory, 'LICENSE'), 'MIT license');
    writePackage(
      root,
      'parent',
      {license: 'MIT', dependencies: {runtime: '1.0.0'}},
      'MIT license',
    );
    fs.writeFileSync(
      path.join(root, 'package-lock.json'),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': {dependencies: {runtime: '1.0.0', parent: '1.0.0'}},
          'node_modules/runtime': {version: '1.0.0', license: 'MIT'},
          'node_modules/parent': {
            version: '1.0.0',
            license: 'MIT',
            dependencies: {runtime: '1.0.0'},
          },
          'node_modules/parent/node_modules/runtime': {
            version: '1.0.0',
            license: 'MIT',
          },
        },
      }),
    );

    const packages = generateCatalog({rootDirectory: root}).packages;
    expect(packages.filter(item => item.name === 'runtime')).toHaveLength(1);
  });
});
