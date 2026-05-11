import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runChildProcess } from "@penclipai/adapter-utils/server-utils";
import { prepareCursorSandboxCommand } from "./remote-command.js";

function resolveTestPosixShellCommand(command: "bash" | "sh") {
  if (process.platform !== "win32") return command === "bash" ? "/bin/bash" : "/bin/sh";
  const candidates = command === "bash"
    ? ["C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files\\Git\\usr\\bin\\bash.exe"]
    : ["C:\\Program Files\\Git\\usr\\bin\\sh.exe", "C:\\Program Files\\Git\\bin\\bash.exe"];
  return candidates.find((candidate) => existsSync(candidate)) ?? command;
}

function toGitShellPath(value: string) {
  if (process.platform !== "win32") return value;
  return value.replace(/^([A-Za-z]):\\/, (_match, drive: string) => `/${drive.toLowerCase()}/`).replace(/\\/g, "/");
}

function fromGitShellPath(value: string) {
  if (process.platform !== "win32") return value;
  return value.replace(/^\/([a-zA-Z])\//, (_match, drive: string) => `${drive.toUpperCase()}:\\`).replace(/\//g, "\\");
}

function rewriteWindowsPathsForGitShell(script: string) {
  if (process.platform !== "win32") return script;
  return script.replace(/([A-Za-z]):\\([^'"\s]*)/g, (_match, drive: string, rest: string) =>
    `/${drive.toLowerCase()}/${rest.replace(/\\/g, "/")}`,
  );
}

function createLocalSandboxRunner() {
  let counter = 0;
  return {
    execute: async (input: {
      command: string;
      args?: string[];
      cwd?: string;
      env?: Record<string, string>;
      stdin?: string;
      timeoutMs?: number;
      onLog?: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
      onSpawn?: (meta: { pid: number; startedAt: string }) => Promise<void>;
    }) => {
      counter += 1;
      const args = [...(input.args ?? [])];
      const command =
        input.command === "bash" || input.command === "sh"
          ? resolveTestPosixShellCommand(input.command)
          : fromGitShellPath(input.command);
      if (
        (input.command === "bash" || input.command === "sh") &&
        (args[0] === "-lc" || args[0] === "-c") &&
        typeof args[1] === "string"
      ) {
        args[1] = rewriteWindowsPathsForGitShell(args[1]);
      }
      return await runChildProcess(`cursor-remote-command-${counter}`, command, args, {
        cwd: fromGitShellPath(input.cwd ?? process.cwd()),
        env: input.env ?? {},
        stdin: input.stdin,
        timeoutSec: Math.max(1, Math.ceil((input.timeoutMs ?? 30_000) / 1000)),
        graceSec: 5,
        onLog: input.onLog ?? (async () => {}),
        onSpawn: input.onSpawn
          ? async (meta) => input.onSpawn?.({ pid: meta.pid, startedAt: meta.startedAt })
          : undefined,
      });
    },
  };
}

async function writeFakeAgent(commandPath: string): Promise<void> {
  const script = `#!/bin/sh
printf '%s\\n' ok
`;
  await fs.mkdir(path.dirname(commandPath), { recursive: true });
  await fs.writeFile(commandPath, script, "utf8");
  await fs.chmod(commandPath, 0o755);
}

describe("prepareCursorSandboxCommand", () => {
  it("prefers the Cursor installer bin directory when the default agent entrypoint is installed there", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-cursor-remote-command-cursor-bin-"));
    const systemHomeDir = path.join(root, "system-home");
    const managedHomeDir = path.join(root, "managed-home");
    const remoteWorkspace = path.join(root, "workspace");
    const cursorAgentPath = path.join(systemHomeDir, ".cursor", "bin", "agent");
    const remoteCursorAgentPath = toGitShellPath(cursorAgentPath);
    const remoteSystemHomeDir = toGitShellPath(systemHomeDir);
    const remoteLocalBinDir = toGitShellPath(path.join(systemHomeDir, ".local", "bin"));
    const remoteCursorBinDir = toGitShellPath(path.join(systemHomeDir, ".cursor", "bin"));
    await fs.mkdir(remoteWorkspace, { recursive: true });
    await writeFakeAgent(cursorAgentPath);

    try {
      const result = await prepareCursorSandboxCommand({
        runId: "run-remote-command-cursor-bin",
        target: {
          kind: "remote",
          transport: "sandbox",
          shellCommand: "bash",
          remoteCwd: remoteWorkspace,
          runner: createLocalSandboxRunner(),
          timeoutMs: 30_000,
        },
        command: "agent",
        cwd: remoteWorkspace,
        env: {
          HOME: toGitShellPath(managedHomeDir),
          PATH: "/usr/bin:/bin",
        },
        remoteSystemHomeDirHint: remoteSystemHomeDir,
        timeoutSec: 30,
        graceSec: 5,
      });

      expect(result.command).toBe(remoteCursorAgentPath);
      expect(result.preferredCommandPath).toBe(remoteCursorAgentPath);
      expect(result.remoteSystemHomeDir).toBe(remoteSystemHomeDir);
      expect(result.addedPathEntry).toBe(remoteLocalBinDir);
      expect(result.env.PATH?.split(":").slice(0, 2)).toEqual([
        remoteLocalBinDir,
        remoteCursorBinDir,
      ]);
      expect(result.env.PATH).not.toContain(toGitShellPath(path.join(managedHomeDir, ".cursor", "bin")));
      expect(result.env.PATH).not.toContain(toGitShellPath(path.join(managedHomeDir, ".local", "bin")));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("keeps probing the original sandbox home after managed HOME overrides", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-cursor-remote-command-"));
    const systemHomeDir = path.join(root, "system-home");
    const managedHomeDir = path.join(root, "managed-home");
    const remoteWorkspace = path.join(root, "workspace");
    const systemAgentPath = path.join(systemHomeDir, ".local", "bin", "agent");
    const remoteSystemAgentPath = toGitShellPath(systemAgentPath);
    const remoteSystemHomeDir = toGitShellPath(systemHomeDir);
    const remoteLocalBinDir = toGitShellPath(path.join(systemHomeDir, ".local", "bin"));
    const remoteCursorBinDir = toGitShellPath(path.join(systemHomeDir, ".cursor", "bin"));
    await fs.mkdir(remoteWorkspace, { recursive: true });
    await writeFakeAgent(systemAgentPath);

    try {
      const result = await prepareCursorSandboxCommand({
        runId: "run-remote-command-1",
        target: {
          kind: "remote",
          transport: "sandbox",
          shellCommand: "bash",
          remoteCwd: remoteWorkspace,
          runner: createLocalSandboxRunner(),
          timeoutMs: 30_000,
        },
        command: "agent",
        cwd: remoteWorkspace,
        env: {
          HOME: toGitShellPath(managedHomeDir),
          PATH: "/usr/bin:/bin",
        },
        remoteSystemHomeDirHint: remoteSystemHomeDir,
        timeoutSec: 30,
        graceSec: 5,
      });

      expect(result.command).toBe(remoteSystemAgentPath);
      expect(result.preferredCommandPath).toBe(remoteSystemAgentPath);
      expect(result.remoteSystemHomeDir).toBe(remoteSystemHomeDir);
      expect(result.addedPathEntry).toBe(remoteLocalBinDir);
      expect(result.env.PATH?.split(":").slice(0, 2)).toEqual([
        remoteLocalBinDir,
        remoteCursorBinDir,
      ]);
      expect(result.env.PATH).not.toContain(toGitShellPath(path.join(managedHomeDir, ".local", "bin")));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
