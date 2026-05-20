import { describe, expect, it } from "vitest";
import {
  readRuntimeUiLocaleFromContextSnapshot,
  resolveEffectiveRuntimeUiLocale,
  resolveEffectiveRuntimeUiLocaleForContextSnapshot,
  resolveRuntimeLocalizationPrompt,
} from "../services/agent-runtime-localization.js";

describe("resolveEffectiveRuntimeUiLocale", () => {
  it("prefers the explicit request locale over the instance default", () => {
    expect(resolveEffectiveRuntimeUiLocale({
      requestedUiLocale: "en-US",
      runtimeDefaultLocale: "zh-CN",
    })).toBe("en");
  });

  it("falls back to the stored runtime locale when no explicit request locale was provided", () => {
    expect(resolveEffectiveRuntimeUiLocale({
      runtimeUiLocale: "en",
      runtimeDefaultLocale: "zh-CN",
    })).toBe("en");
  });

  it("uses the instance default locale when no request-scoped locale was provided", () => {
    expect(resolveEffectiveRuntimeUiLocale({
      runtimeDefaultLocale: "en",
    })).toBe("en");
  });

  it("keeps zh-CN as the final fallback", () => {
    expect(resolveEffectiveRuntimeUiLocale({})).toBe("zh-CN");
  });
});

describe("resolveEffectiveRuntimeUiLocaleForContextSnapshot", () => {
  it("reads runtimeUiLocale from the run context when present", () => {
    expect(
      resolveEffectiveRuntimeUiLocaleForContextSnapshot(
        { runtimeUiLocale: "en" },
        "zh-CN",
      ),
    ).toBe("en");
  });

  it("falls back to the instance default locale for contexts without a stored runtimeUiLocale", () => {
    expect(
      resolveEffectiveRuntimeUiLocaleForContextSnapshot(
        {},
        "en",
      ),
    ).toBe("en");
  });

  it("reads only the persisted runtime locale from the helper accessor", () => {
    expect(readRuntimeUiLocaleFromContextSnapshot({ runtimeUiLocale: "zh-CN" })).toBe("zh-CN");
    expect(readRuntimeUiLocaleFromContextSnapshot({ requestedUiLocale: "en" })).toBeNull();
  });
});

describe("resolveRuntimeLocalizationPrompt", () => {
  it("returns a concise zh-CN note for Windows PowerShell", () => {
    const note = resolveRuntimeLocalizationPrompt({
      locale: "zh-CN",
      platform: "win32",
      shell: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
    });

    expect(note).toContain("## Paperclip Runtime Rules");
    expect(note).toContain("Respond to users in Simplified Chinese");
    expect(note).toContain("latest message explicitly requests another language");
    expect(note).toContain("Preserve code, commands, paths, API fields, identifiers, logs, and quoted text verbatim.");
    expect(note).toContain("Use `penclip` for Paperclip operations.");
    expect(note).toContain("Call HTTP APIs only when no CLI command fits");
    expect(note).toContain("avoid raw `curl` POST bodies");
    expect(note).toContain("prevent non-ASCII text encoding corruption");
    expect(note).toContain("Create files with UTF-8/Unicode filenames");
    expect(note).toContain("non-ASCII filenames");
    expect(note).toContain("legacy code pages");
    expect(note).toContain("Runtime: Windows PowerShell.");
    expect(note).not.toContain("CLI 契约");
    expect(note).not.toContain("API 契约");
    expect(note).not.toContain("Python / Node");
  });

  it("describes WSL precisely when the runtime is WSL", () => {
    const note = resolveRuntimeLocalizationPrompt({
      locale: "zh-CN",
      platform: "linux",
      shell: "/bin/bash",
      env: { WSL_DISTRO_NAME: "Ubuntu" },
      osRelease: "6.6.87.2-microsoft-standard-WSL2",
    });

    expect(note).toContain("Runtime: WSL bash.");
    expect(note).toContain("Simplified Chinese");
    expect(note).toContain("Use `penclip` for Paperclip operations.");
    expect(note).toContain("UTF-8/Unicode filenames");
  });

  it("returns an English note with a detected POSIX shell label", () => {
    const note = resolveRuntimeLocalizationPrompt({
      locale: "en",
      platform: "darwin",
      shell: "/bin/zsh",
    });

    expect(note).toContain("## Paperclip Runtime Rules");
    expect(note).toContain("Respond to users in English");
    expect(note).toContain("Preserve code, commands, paths, API fields, identifiers, logs, and quoted text verbatim.");
    expect(note).toContain("Use `penclip` for Paperclip operations.");
    expect(note).toContain("Call HTTP APIs only when no CLI command fits");
    expect(note).toContain("avoid raw `curl` POST bodies");
    expect(note).toContain("Create files with UTF-8/Unicode filenames");
    expect(note).toContain("Runtime: zsh on darwin.");
    expect(note).not.toContain("CLI contract");
    expect(note).not.toContain("API contract");
    expect(note).not.toContain("Python / Node");
  });
});
