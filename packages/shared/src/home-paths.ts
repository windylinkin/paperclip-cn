import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_PAPERCLIP_INSTANCE_ID = "default";
export const PAPERCLIP_CONFIG_BASENAME = "config.json";
export const PAPERCLIP_ENV_FILENAME = ".env";

const PATH_SEGMENT_RE = /^[a-zA-Z0-9_-]+$/;
const DESKTOP_TEMP_INSTANCE_PATH_RE = /paperclip-desktop-(?:smoke|acceptance)-/i;
const LEGACY_WINDOWS_HOME_PREFIX_RE =
  /^([A-Za-z]:[\\/].*?AppData[\\/]Roaming[\\/])(Paperclip CN|Paperclip)([\\/]|$)/i;
const DESKTOP_USER_DATA_DIRNAME = "penclip";

export function normalizeLegacyDesktopStoragePath(value: string): string {
  return value.replace(
    LEGACY_WINDOWS_HOME_PREFIX_RE,
    (_, prefix: string, _name: string, suffix: string) => `${prefix}${DESKTOP_USER_DATA_DIRNAME}${suffix}`,
  );
}

export function expandHomePrefix(value: string): string {
  const normalized = normalizeLegacyDesktopStoragePath(value);
  if (normalized === "~") return os.homedir();
  if (normalized.startsWith("~/") || normalized.startsWith("~\\")) {
    return path.resolve(os.homedir(), normalized.slice(2).replace(/[\\/]+/g, path.sep));
  }
  return normalized;
}

function isPathInsideDir(candidatePath: string, parentDir: string): boolean {
  const resolvedCandidate = path.resolve(candidatePath);
  const resolvedParent = path.resolve(parentDir);
  const relative = path.relative(resolvedParent, resolvedCandidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isFreshDesktopTempHome(candidate: string | undefined): boolean {
  const desktopUserDataDir = process.env.PAPERCLIP_DESKTOP_USER_DATA_DIR?.trim();
  const trimmed = candidate?.trim();
  if (!desktopUserDataDir || !trimmed) return false;
  return isPathInsideDir(trimmed, path.resolve(desktopUserDataDir));
}

export function resolvePaperclipHomeDir(homeOverride?: string): string {
  const raw = homeOverride?.trim() || process.env.PAPERCLIP_HOME?.trim();
  if (raw) {
    const resolved = path.resolve(expandHomePrefix(raw));
    if (
      isFreshDesktopTempHome(resolved)
      || !(DESKTOP_TEMP_INSTANCE_PATH_RE.test(resolved) && !existsSync(resolved))
    ) {
      return resolved;
    }
  }
  return path.resolve(os.homedir(), ".paperclip");
}

export function resolvePaperclipInstanceId(instanceIdOverride?: string): string {
  const raw = instanceIdOverride?.trim() || process.env.PAPERCLIP_INSTANCE_ID?.trim() || DEFAULT_PAPERCLIP_INSTANCE_ID;
  if (!PATH_SEGMENT_RE.test(raw)) {
    throw new Error(`Invalid PAPERCLIP_INSTANCE_ID '${raw}'.`);
  }
  return raw;
}

export function resolvePaperclipInstanceRoot(input: {
  homeDir?: string;
  instanceId?: string;
} = {}): string {
  return path.resolve(resolvePaperclipHomeDir(input.homeDir), "instances", resolvePaperclipInstanceId(input.instanceId));
}

export function resolvePaperclipInstanceConfigPath(input: {
  homeDir?: string;
  instanceId?: string;
} = {}): string {
  return path.resolve(resolvePaperclipInstanceRoot(input), PAPERCLIP_CONFIG_BASENAME);
}

export function resolvePaperclipConfigPathForInstance(input: {
  homeDir?: string;
  instanceId?: string;
} = {}): string {
  return resolvePaperclipInstanceConfigPath(input);
}

export function resolvePaperclipEnvPathForConfig(configPath: string): string {
  return path.resolve(path.dirname(configPath), PAPERCLIP_ENV_FILENAME);
}

export function resolveDefaultEmbeddedPostgresDir(input: {
  homeDir?: string;
  instanceId?: string;
} = {}): string {
  return path.resolve(resolvePaperclipInstanceRoot(input), "db");
}

export function resolveDefaultLogsDir(input: {
  homeDir?: string;
  instanceId?: string;
} = {}): string {
  return path.resolve(resolvePaperclipInstanceRoot(input), "logs");
}

export function resolveDefaultSecretsKeyFilePath(input: {
  homeDir?: string;
  instanceId?: string;
} = {}): string {
  return path.resolve(resolvePaperclipInstanceRoot(input), "secrets", "master.key");
}

export function resolveDefaultStorageDir(input: {
  homeDir?: string;
  instanceId?: string;
} = {}): string {
  return path.resolve(resolvePaperclipInstanceRoot(input), "data", "storage");
}

export function resolveDefaultBackupDir(input: {
  homeDir?: string;
  instanceId?: string;
} = {}): string {
  return path.resolve(resolvePaperclipInstanceRoot(input), "data", "backups");
}

export function resolveHomeAwarePath(value: string): string {
  return path.resolve(expandHomePrefix(value));
}
