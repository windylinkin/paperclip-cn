import os from "node:os";
import {
  DEFAULT_UI_LOCALE,
  type UiLocale,
} from "@penclipai/shared";

type ResolveRuntimeLocalizationPromptInput = {
  locale: UiLocale;
  platform?: NodeJS.Platform;
  shell?: string | null;
  env?: NodeJS.ProcessEnv;
  osRelease?: string | null;
};

type RuntimeEnvironmentDescriptor = {
  labelZh: string;
  labelEn: string;
};

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function parseSupportedUiLocale(value: unknown): UiLocale | null {
  const candidate = readNonEmptyString(value);
  if (!candidate) return null;
  const normalized = candidate.trim().toLowerCase();
  if (normalized.startsWith("zh")) return "zh-CN";
  if (normalized.startsWith("en")) return "en";
  return null;
}

function stripExecutableName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/[\\/]/g);
  return parts[parts.length - 1] || trimmed;
}

function isPowerShellShell(shell: string | null, env: NodeJS.ProcessEnv): boolean {
  if (shell && /(^|[\\/])(pwsh|powershell)(\.exe)?$/i.test(shell)) {
    return true;
  }
  return Boolean(env.POWERSHELL_DISTRIBUTION_CHANNEL || env.PSExecutionPolicyPreference);
}

function isCmdShell(shell: string | null): boolean {
  return Boolean(shell && /(^|[\\/])cmd(\.exe)?$/i.test(shell));
}

function isWslRuntime(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, osRelease: string | null): boolean {
  if (platform !== "linux") return false;
  return Boolean(
    env.WSL_DISTRO_NAME
    || env.WSL_INTEROP
    || (osRelease && /microsoft/i.test(osRelease)),
  );
}

function resolveRuntimeEnvironment(
  input: ResolveRuntimeLocalizationPromptInput,
): RuntimeEnvironmentDescriptor {
  const platform = input.platform ?? process.platform;
  const env = input.env ?? process.env;
  const shell = input.shell?.trim()
    || env.SHELL?.trim()
    || env.ComSpec?.trim()
    || env.COMSPEC?.trim()
    || null;
  const shellName = stripExecutableName(shell);
  const osRelease = input.osRelease ?? (platform === "linux" ? os.release() : null);

  if (isWslRuntime(platform, env, osRelease)) {
    const wslShell = shellName ?? "sh";
    return {
      labelZh: `WSL ${wslShell}`,
      labelEn: `WSL ${wslShell}`,
    };
  }

  if (platform === "win32") {
    if (isPowerShellShell(shell, env)) {
      return {
        labelZh: "Windows PowerShell",
        labelEn: "Windows PowerShell",
      };
    }

    if (isCmdShell(shell)) {
      return {
        labelZh: "Windows cmd.exe",
        labelEn: "Windows cmd.exe",
      };
    }

    if (shellName) {
      return {
        labelZh: `Windows shell (${shellName})`,
        labelEn: `Windows shell (${shellName})`,
      };
    }

    return {
      labelZh: "Windows",
      labelEn: "Windows",
    };
  }

  if (shellName) {
    return {
      labelZh: `${shellName} on ${platform}`,
      labelEn: `${shellName} on ${platform}`,
    };
  }

  return {
    labelZh: platform,
    labelEn: platform,
  };
}

function buildRuntimeLocalizationPrompt(locale: UiLocale, environment: RuntimeEnvironmentDescriptor): string {
  const outputLanguage = locale === "en" ? "English" : "Simplified Chinese";
  const runtimeLabel = locale === "en" ? environment.labelEn : environment.labelZh;
  return [
    "## Paperclip Runtime Rules",
    `- Respond to users in ${outputLanguage} unless their latest message explicitly requests another language.`,
    "- Preserve code, commands, paths, API fields, identifiers, logs, and quoted text verbatim.",
    "- Use `penclip` for Paperclip operations. Call HTTP APIs only when no CLI command fits; avoid raw `curl` POST bodies for comments/documents to prevent non-ASCII text encoding corruption.",
    "- Create files with UTF-8/Unicode filenames; avoid commands that route non-ASCII filenames through legacy code pages.",
    `- Runtime: ${runtimeLabel}.`,
  ].join("\n");
}

export function readRuntimeUiLocaleFromContextSnapshot(
  contextSnapshot: Record<string, unknown> | null | undefined,
): UiLocale | null {
  return parseSupportedUiLocale(contextSnapshot?.runtimeUiLocale);
}

export function resolveEffectiveRuntimeUiLocale(input: {
  requestedUiLocale?: unknown;
  runtimeUiLocale?: unknown;
  runtimeDefaultLocale?: unknown;
}): UiLocale {
  return (
    parseSupportedUiLocale(input.requestedUiLocale) ??
    parseSupportedUiLocale(input.runtimeUiLocale) ??
    parseSupportedUiLocale(input.runtimeDefaultLocale) ??
    DEFAULT_UI_LOCALE
  );
}

export function resolveEffectiveRuntimeUiLocaleForContextSnapshot(
  contextSnapshot: Record<string, unknown> | null | undefined,
  runtimeDefaultLocale?: unknown,
): UiLocale {
  return resolveEffectiveRuntimeUiLocale({
    requestedUiLocale: contextSnapshot?.requestedUiLocale,
    runtimeUiLocale: contextSnapshot?.runtimeUiLocale,
    runtimeDefaultLocale,
  });
}

export function resolveRuntimeLocalizationPrompt(
  input: ResolveRuntimeLocalizationPromptInput,
): string {
  const environment = resolveRuntimeEnvironment(input);
  return buildRuntimeLocalizationPrompt(input.locale, environment);
}
