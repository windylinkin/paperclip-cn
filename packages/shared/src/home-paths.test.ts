import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveDefaultBackupDir,
  resolveDefaultEmbeddedPostgresDir,
  resolveDefaultLogsDir,
  resolveDefaultSecretsKeyFilePath,
  resolveDefaultStorageDir,
  resolveHomeAwarePath,
  resolvePaperclipConfigPathForInstance,
  resolvePaperclipHomeDir,
  resolvePaperclipInstanceRoot,
} from "./home-paths.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("home path resolution", () => {
  it("resolves config and runtime data directly under the instance root", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-home-paths-"));
    process.env.PAPERCLIP_HOME = home;
    delete process.env.PAPERCLIP_INSTANCE_ID;

    const instanceRoot = path.join(home, "instances", "default");
    expect(resolvePaperclipInstanceRoot()).toBe(instanceRoot);
    expect(resolvePaperclipConfigPathForInstance()).toBe(path.join(instanceRoot, "config.json"));
    expect(resolveDefaultEmbeddedPostgresDir()).toBe(path.join(instanceRoot, "db"));
    expect(resolveDefaultBackupDir()).toBe(path.join(instanceRoot, "data", "backups"));
    expect(resolveDefaultLogsDir()).toBe(path.join(instanceRoot, "logs"));
    expect(resolveDefaultStorageDir()).toBe(path.join(instanceRoot, "data", "storage"));
    expect(resolveDefaultSecretsKeyFilePath()).toBe(path.join(instanceRoot, "secrets", "master.key"));
  });

  it("expands Windows-style home prefixes", () => {
    expect(resolveHomeAwarePath("~\\adapter\\package")).toBe(
      path.resolve(os.homedir(), "adapter", "package"),
    );
  });

  it("preserves a fresh desktop temp PAPERCLIP_HOME inside the active desktop user-data dir", () => {
    const userDataDir = path.join(os.tmpdir(), "paperclip-desktop-acceptance-dark-12345");
    const runtimeDir = path.join(userDataDir, "runtime");
    process.env.PAPERCLIP_DESKTOP_USER_DATA_DIR = userDataDir;
    process.env.PAPERCLIP_HOME = runtimeDir;

    expect(resolvePaperclipHomeDir()).toBe(path.resolve(runtimeDir));
  });

  it("ignores broken inherited desktop temp homes outside the current desktop user-data dir", () => {
    const currentUserDataDir = path.join(os.tmpdir(), "paperclip-desktop-acceptance-dark-12345");
    const staleRuntimeDir = path.join(os.tmpdir(), "paperclip-desktop-smoke-dev-light-stale", "runtime");
    process.env.PAPERCLIP_DESKTOP_USER_DATA_DIR = currentUserDataDir;
    process.env.PAPERCLIP_HOME = staleRuntimeDir;

    expect(resolvePaperclipHomeDir()).toBe(path.resolve(os.homedir(), ".paperclip"));
  });
});
