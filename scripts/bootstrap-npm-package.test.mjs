import assert from "node:assert/strict";
import test from "node:test";

import { buildPublishPackageJson, parseArgs, resolveTargetPackage } from "./bootstrap-npm-package.mjs";

test("parseArgs recognizes publish and skip-build flags", () => {
  assert.deepEqual(parseArgs(["@penclipai/adapter-acpx-local", "--publish", "--skip-build"]), {
    help: false,
    selector: "@penclipai/adapter-acpx-local",
    publish: true,
    skipBuild: true,
    otp: null,
  });
});

test("parseArgs accepts an explicit otp value", () => {
  assert.deepEqual(parseArgs(["packages/adapters/acpx-local", "--publish", "--otp", "123456"]), {
    help: false,
    selector: "packages/adapters/acpx-local",
    publish: true,
    skipBuild: false,
    otp: "123456",
  });
});

test("parseArgs leaves otp null when omitted", () => {
  assert.deepEqual(parseArgs(["packages/adapters/acpx-local", "--publish"]), {
    help: false,
    selector: "packages/adapters/acpx-local",
    publish: true,
    skipBuild: false,
    otp: null,
  });
});

test("parseArgs returns help mode", () => {
  assert.deepEqual(parseArgs(["--help"]), {
    help: true,
    selector: null,
    publish: false,
    skipBuild: false,
    otp: null,
  });
});

test("resolveTargetPackage matches by package name or dir", () => {
  const packages = [
    { dir: "packages/a", name: "@penclipai/a", pkg: {} },
    { dir: "packages/b", name: "@penclipai/b", pkg: {} },
  ];

  assert.equal(resolveTargetPackage("@penclipai/a", packages).dir, "packages/a");
  assert.equal(resolveTargetPackage("./packages/b", packages).name, "@penclipai/b");
});

test("buildPublishPackageJson promotes publishConfig and drops dev-only fields", () => {
  const packageJson = buildPublishPackageJson({
    pkg: {
      name: "@penclipai/example",
      version: "1.0.0",
      type: "module",
      repository: {
        type: "git",
        url: "https://github.com/penclipai/paperclip-cn",
      },
      exports: {
        ".": "./src/index.ts",
      },
      publishConfig: {
        access: "public",
        main: "./dist/index.js",
        types: "./dist/index.d.ts",
        exports: {
          ".": {
            import: "./dist/index.js",
            types: "./dist/index.d.ts",
          },
        },
      },
      files: ["dist"],
      scripts: {
        build: "tsc",
      },
      dependencies: {
        picocolors: "^1.1.1",
      },
      devDependencies: {
        typescript: "^5.7.3",
      },
    },
  });

  assert.deepEqual(packageJson.exports, {
    ".": {
      import: "./dist/index.js",
      types: "./dist/index.d.ts",
    },
  });
  assert.equal(packageJson.main, "./dist/index.js");
  assert.equal(packageJson.types, "./dist/index.d.ts");
  assert.deepEqual(packageJson.dependencies, { picocolors: "^1.1.1" });
  assert.deepEqual(packageJson.publishConfig, { access: "public" });
  assert.equal(packageJson.repository.url, "git+https://github.com/penclipai/paperclip-cn.git");
  assert.equal("scripts" in packageJson, false);
  assert.equal("devDependencies" in packageJson, false);
});

test("buildPublishPackageJson converts local compatibility aliases to npm aliases", () => {
  const packageJson = buildPublishPackageJson(
    {
      pkg: {
        name: "@penclipai/example",
        version: "1.0.0",
        dependencies: {
          "@paperclipai/plugin-sdk": "link:../../packages/plugins/sdk",
          "@paperclipai/shared": "workspace:@penclipai/shared@*",
          "@daytonaio/sdk": "^0.171.0",
        },
      },
    },
    {
      resolveDependencyVersion(name) {
        return name === "@penclipai/plugin-sdk" ? "2026.428.0" : "2026.428.1";
      },
    },
  );

  assert.deepEqual(packageJson.dependencies, {
    "@paperclipai/plugin-sdk": "npm:@penclipai/plugin-sdk@2026.428.0",
    "@paperclipai/shared": "npm:@penclipai/shared@2026.428.1",
    "@daytonaio/sdk": "^0.171.0",
  });
});
