const fs = require('node:fs');
const path = require('node:path');

const LICENSE_FILE = /^(?:licen[cs]e|copying)(?:[._ -].*)?$/i;
const NOTICE_FILE = /^(?:notice|authors)(?:[._ -].*)?$/i;

const normalizeText = value =>
  value
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n*$/, '\n');

const compareText = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

const resolvePackageKey = (packages, from, name) => {
  let directory = from;
  while (true) {
    const candidate = `${directory ? `${directory}/` : ''}node_modules/${name}`;
    if (packages[candidate]) {
      return candidate;
    }
    const parent = directory.lastIndexOf('/node_modules/');
    if (parent < 0) {
      break;
    }
    directory = directory.slice(0, parent);
  }
  const rootCandidate = `node_modules/${name}`;
  return packages[rootCandidate] ? rootCandidate : undefined;
};

const readTextFiles = (directory, matcher) => {
  const matches = [];
  const visit = (currentDirectory, relativeDirectory, depth) => {
    for (const file of fs.readdirSync(currentDirectory).sort(compareText)) {
      const filePath = path.join(currentDirectory, file);
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${file}`
        : file;
      const stats = fs.statSync(filePath);
      if (stats.isFile() && matcher.test(file)) {
        matches.push({
          file: relativePath,
          text: normalizeText(fs.readFileSync(filePath, 'utf8')),
        });
      } else if (
        stats.isDirectory() &&
        file !== 'node_modules' &&
        depth < 4
      ) {
        visit(filePath, relativePath, depth + 1);
      }
    }
  };
  visit(directory, '', 0);
  return matches;
};

const repositoryUrl = pkg => {
  if (typeof pkg.repository === 'string') {
    return pkg.repository;
  }
  if (pkg.repository && typeof pkg.repository.url === 'string') {
    return pkg.repository.url;
  }
  return typeof pkg.homepage === 'string' ? pkg.homepage : undefined;
};

const declaredLicense = pkg => {
  if (typeof pkg.license === 'string') {
    return pkg.license;
  }
  if (Array.isArray(pkg.licenses)) {
    const identifiers = pkg.licenses
      .map(item => (typeof item === 'string' ? item : item?.type))
      .filter(Boolean);
    return identifiers.length > 0 ? identifiers.join(' OR ') : undefined;
  }
  return undefined;
};

const productionDependencies = entry => {
  const dependencies = {
    ...(entry.dependencies ?? {}),
    ...(entry.optionalDependencies ?? {}),
  };
  for (const peer of Object.keys(entry.peerDependencies ?? {})) {
    if (!entry.peerDependenciesMeta?.[peer]?.optional) {
      dependencies[peer] = entry.peerDependencies[peer];
    }
  }
  return dependencies;
};

const generateCatalog = ({
  rootDirectory,
  lockPath = path.join(rootDirectory, 'package-lock.json'),
  overridesPath = path.join(rootDirectory, 'licenses', 'license-overrides.json'),
}) => {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  if (lock.lockfileVersion !== 3 || !lock.packages?.['']) {
    throw new Error('Expected a package-lock.json v3 packages map.');
  }
  const overrides = fs.existsSync(overridesPath)
    ? JSON.parse(fs.readFileSync(overridesPath, 'utf8'))
    : {};
  const packages = lock.packages;
  const rootDependencies = Object.keys(productionDependencies(packages[''])).sort(
    compareText,
  );
  const queue = rootDependencies.map(name => ({from: '', name}));
  const visited = new Set();
  const recordsByIdentity = new Map();
  const missing = [];

  while (queue.length > 0) {
    const request = queue.shift();
    const key = resolvePackageKey(packages, request.from, request.name);
    if (!key) {
      throw new Error(
        `Cannot resolve production dependency ${request.name} from ${
          request.from || 'the app'
        }.`,
      );
    }
    if (visited.has(key)) {
      continue;
    }
    const entry = packages[key];
    if (entry.dev || entry.devOptional) {
      continue;
    }
    const directory = path.join(rootDirectory, ...key.split('/'));
    if (!fs.existsSync(directory)) {
      if (entry.optional) {
        continue;
      }
      throw new Error(`Installed production package is missing: ${key}`);
    }
    const packagePath = path.join(directory, 'package.json');
    if (!fs.existsSync(packagePath)) {
      throw new Error(`Package metadata is missing: ${key}/package.json`);
    }

    visited.add(key);
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const identity = `${pkg.name}@${pkg.version}`;
    const override = overrides[identity];
    if (override && !override.reason) {
      throw new Error(`Reviewed license override requires a reason: ${identity}`);
    }
    const license =
      override?.license ?? declaredLicense(pkg) ?? entry.license;
    const licenseFiles = readTextFiles(directory, LICENSE_FILE);
    const noticeFiles = readTextFiles(directory, NOTICE_FILE);
    if (override?.licenseText) {
      licenseFiles.push({
        file: override.source ?? 'Reviewed license override',
        text: normalizeText(override.licenseText),
      });
    }
    if (override?.licenseTextFile) {
      const reviewedPath = path.resolve(rootDirectory, override.licenseTextFile);
      const reviewedRoot = path.resolve(rootDirectory, 'licenses', 'reviewed');
      if (
        reviewedPath !== reviewedRoot &&
        !reviewedPath.startsWith(`${reviewedRoot}${path.sep}`)
      ) {
        throw new Error(
          `Reviewed license text must stay under licenses/reviewed: ${identity}`,
        );
      }
      if (!fs.existsSync(reviewedPath)) {
        throw new Error(`Reviewed license text is missing: ${reviewedPath}`);
      }
      licenseFiles.push({
        file: override.source ?? override.licenseTextFile,
        text: normalizeText(fs.readFileSync(reviewedPath, 'utf8')),
      });
    }
    if (!license) {
      missing.push(`${identity}: license identifier`);
    }
    if (licenseFiles.length === 0) {
      missing.push(`${identity}: license text`);
    }
    for (const file of licenseFiles) {
      if (!file.text.trim()) {
        missing.push(`${identity}: license text (${file.file})`);
      }
    }
    for (const file of noticeFiles) {
      if (!file.text.trim()) {
        missing.push(`${identity}: NOTICE text (${file.file})`);
      }
    }

    const record = {
      name: pkg.name,
      version: pkg.version,
      license,
      repository: repositoryUrl(pkg),
      overrideReason: override?.reason,
      licenseFiles,
      noticeFiles,
    };
    const existingRecord = recordsByIdentity.get(identity);
    if (
      existingRecord &&
      JSON.stringify(existingRecord) !== JSON.stringify(record)
    ) {
      throw new Error(
        `Conflicting metadata for duplicate production package: ${identity}`,
      );
    }
    recordsByIdentity.set(identity, record);

    const dependencies = productionDependencies(entry);
    for (const dependency of Object.keys(dependencies).sort(compareText)) {
      const optional =
        Object.prototype.hasOwnProperty.call(
          entry.optionalDependencies ?? {},
          dependency,
        ) || entry.peerDependenciesMeta?.[dependency]?.optional;
      const resolved = resolvePackageKey(packages, key, dependency);
      if (!resolved && !optional) {
        throw new Error(
          `Cannot resolve production dependency ${dependency} from ${identity}.`,
        );
      }
      if (resolved) {
        queue.push({from: key, name: dependency});
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Refusing to generate an incomplete license catalog:\n${missing
        .sort(compareText)
        .join('\n')}`,
    );
  }

  const records = [...recordsByIdentity.values()].sort(
    (left, right) =>
      compareText(left.name, right.name) ||
      compareText(left.version, right.version),
  );
  return {schemaVersion: 1, packages: records};
};

const writeCatalog = ({
  rootDirectory,
  outputPath = path.join(rootDirectory, 'licenses', 'js-licenses.json'),
}) => {
  const catalog = generateCatalog({rootDirectory});
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
  return catalog;
};

if (require.main === module) {
  writeCatalog({rootDirectory: path.resolve(__dirname, '..')});
}

module.exports = {generateCatalog, writeCatalog};
