import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReleasePublishPackageJson,
  createReleaseDependencyResolver,
  shouldPrepareReleasePublishManifest,
} from "./prepare-release-publish-manifests.mjs";

test("release publish manifests promote dist exports and strip dev-only fields", () => {
  const packages = [
    {
      name: "@penclipai/shared",
      dir: "packages/shared",
      pkg: {
        name: "@penclipai/shared",
        version: "2026.521.0-canary.1",
      },
    },
    {
      name: "@penclipai/example",
      dir: "packages/example",
      pkg: {
        name: "@penclipai/example",
        version: "2026.521.0-canary.1",
        type: "module",
        exports: {
          ".": "./src/index.ts",
        },
        publishConfig: {
          access: "public",
          exports: {
            ".": {
              types: "./dist/index.d.ts",
              import: "./dist/index.js",
            },
          },
          main: "./dist/index.js",
          types: "./dist/index.d.ts",
        },
        files: ["dist"],
        scripts: {
          build: "tsc",
        },
        dependencies: {
          "@penclipai/shared": "workspace:*",
          zod: "^3.24.2",
        },
        devDependencies: {
          typescript: "^5.7.3",
        },
      },
    },
  ];

  const packageJson = buildReleasePublishPackageJson(packages[1], packages);

  assert.deepEqual(packageJson.exports, {
    ".": {
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
    },
  });
  assert.equal(packageJson.main, "./dist/index.js");
  assert.equal(packageJson.types, "./dist/index.d.ts");
  assert.deepEqual(packageJson.dependencies, {
    "@penclipai/shared": "2026.521.0-canary.1",
    zod: "^3.24.2",
  });
  assert.deepEqual(packageJson.publishConfig, { access: "public" });
  assert.equal("scripts" in packageJson, false);
  assert.equal("devDependencies" in packageJson, false);
});

test("release dependency resolver maps compatibility aliases to same-release versions", () => {
  const packages = [
    {
      name: "@penclipai/plugin-sdk",
      dir: "packages/plugins/sdk",
      pkg: {
        name: "@penclipai/plugin-sdk",
        version: "2026.521.0-canary.1",
      },
    },
    {
      name: "@penclipai/plugin-example",
      dir: "packages/plugins/example",
      pkg: {
        name: "@penclipai/plugin-example",
        version: "2026.521.0-canary.1",
        dependencies: {
          "@paperclipai/plugin-sdk": "link:../../packages/plugins/sdk",
        },
      },
    },
  ];

  const packageJson = buildReleasePublishPackageJson(packages[1], packages);

  assert.deepEqual(packageJson.dependencies, {
    "@paperclipai/plugin-sdk": "npm:@penclipai/plugin-sdk@2026.521.0-canary.1",
  });
});

test("release dependency resolver fails when a same-release package is missing", () => {
  const resolveDependencyVersion = createReleaseDependencyResolver([]);

  assert.throws(
    () => resolveDependencyVersion("@penclipai/missing"),
    /Cannot resolve release dependency @penclipai\/missing/,
  );
});

test("CLI and UI keep their package-specific publish manifest paths", () => {
  assert.equal(shouldPrepareReleasePublishManifest({ name: "penclip" }), false);
  assert.equal(shouldPrepareReleasePublishManifest({ name: "@penclipai/ui" }), false);
  assert.equal(shouldPrepareReleasePublishManifest({ name: "@penclipai/server" }), true);
});
