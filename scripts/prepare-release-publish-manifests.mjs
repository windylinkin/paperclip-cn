#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { buildPublishPackageJson } from "./bootstrap-npm-package.mjs";
import { getReleasePackages } from "./release-package-map.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const SELF_PREPARED_PACKAGE_NAMES = new Set([
  "penclip",
  "@penclipai/ui",
]);

function shouldPrepareReleasePublishManifest(pkg) {
  return !SELF_PREPARED_PACKAGE_NAMES.has(pkg.name);
}

function createReleaseDependencyResolver(packages) {
  const versionsByName = new Map(packages.map((pkg) => [pkg.name, pkg.pkg.version]));

  return function resolveReleaseDependencyVersion(name) {
    const version = versionsByName.get(name);
    if (!version) {
      throw new Error(
        `Cannot resolve release dependency ${name}; expected it in scripts/release-package-manifest.json`,
      );
    }
    return version;
  };
}

function buildReleasePublishPackageJson(pkg, packages) {
  return buildPublishPackageJson(pkg, {
    resolveDependencyVersion: createReleaseDependencyResolver(packages),
  });
}

function prepareReleasePublishManifests(packages = getReleasePackages()) {
  const prepared = [];

  for (const pkg of packages) {
    if (!shouldPrepareReleasePublishManifest(pkg)) continue;

    const packageJson = buildReleasePublishPackageJson(pkg, packages);
    const packageJsonPath = join(repoRoot, pkg.dir, "package.json");
    writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
    prepared.push(pkg.name);
  }

  return prepared;
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    const prepared = prepareReleasePublishManifests();
    process.stdout.write(`Prepared publish manifests for ${prepared.length} packages.\n`);
    for (const name of prepared) {
      process.stdout.write(`  - ${name}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

export {
  buildReleasePublishPackageJson,
  createReleaseDependencyResolver,
  prepareReleasePublishManifests,
  shouldPrepareReleasePublishManifest,
};
