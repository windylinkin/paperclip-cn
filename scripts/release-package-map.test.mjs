import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReleasePackagePlan,
  checkConfiguration,
  findPublishedPackageBlockedDependencies,
  getReleasePackages,
} from "./release-package-map.mjs";

test("release package manifest covers all public packages with explicit CI enrollment", () => {
  const packages = buildReleasePackagePlan();
  assert.ok(packages.length > 0);
  assert.ok(packages.every((pkg) => typeof pkg.publishFromCi === "boolean"));
});

test("release package list only contains CI-enrolled packages", () => {
  const enabledPackages = getReleasePackages();
  assert.ok(enabledPackages.length > 0);
  assert.ok(enabledPackages.every((pkg) => pkg.publishFromCi === true));
});

test("release package configuration validates successfully", () => {
  assert.doesNotThrow(() => checkConfiguration());
});

test("release package configuration catches published packages depending on disabled workspace packages", () => {
  const packages = buildReleasePackagePlan();
  const server = packages.find((pkg) => pkg.name === "@penclipai/server");
  const cursorCloud = packages.find((pkg) => pkg.name === "@penclipai/adapter-cursor-cloud");
  assert.ok(server);
  assert.ok(cursorCloud);

  const problems = findPublishedPackageBlockedDependencies(
    packages.map((pkg) =>
      pkg.name === cursorCloud.name
        ? { ...pkg, publishFromCi: false }
        : pkg,
    ),
  );

  assert.deepEqual(problems, [
    "@penclipai/server dependencies includes @penclipai/adapter-cursor-cloud, but packages/adapters/cursor-cloud has publishFromCi=false",
    "@penclipai/ui dependencies includes @penclipai/adapter-cursor-cloud, but packages/adapters/cursor-cloud has publishFromCi=false",
    "penclip dependencies includes @penclipai/adapter-cursor-cloud, but packages/adapters/cursor-cloud has publishFromCi=false",
  ]);
});
