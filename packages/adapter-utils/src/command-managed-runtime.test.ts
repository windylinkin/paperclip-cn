import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

import { prepareCommandManagedRuntime } from "./command-managed-runtime.js";
import type { RunProcessResult } from "./server-utils.js";

const execFile = promisify(execFileCallback);

function createChildProcessEnv(overrides?: Record<string, string>) {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  return { ...env, ...overrides };
}

function execFileWithInput(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    input?: string;
    maxBuffer?: number;
    timeout?: number;
  },
): Promise<{ stdout: string; stderr: string }> {
  if (options.input == null) {
    return execFile(command, args, {
      cwd: options.cwd,
      env: options.env,
      maxBuffer: options.maxBuffer,
      timeout: options.timeout,
    });
  }

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const timer = options.timeout
      ? setTimeout(() => {
          timedOut = true;
          child.kill();
        }, options.timeout)
      : null;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (options.maxBuffer && stdout.length > options.maxBuffer) child.kill();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (options.maxBuffer && stderr.length > options.maxBuffer) child.kill();
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      if (code === 0 && !timedOut) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(`${command} exited with code ${code ?? "null"}`) as Error & {
        stdout?: string;
        stderr?: string;
        code?: number | null;
        signal?: NodeJS.Signals | null;
        killed?: boolean;
      };
      error.stdout = stdout;
      error.stderr = stderr;
      error.code = code;
      error.signal = signal;
      error.killed = timedOut;
      reject(error);
    });
    child.stdin.end(options.input);
  });
}

function resolveTestPosixShellCommand(command: "bash" | "sh") {
  if (process.platform !== "win32") return command === "bash" ? "/bin/bash" : "/bin/sh";
  const candidates = command === "bash"
    ? ["C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files\\Git\\usr\\bin\\bash.exe"]
    : ["C:\\Program Files\\Git\\usr\\bin\\sh.exe", "C:\\Program Files\\Git\\bin\\bash.exe"];
  return candidates.find((candidate) => existsSync(candidate)) ?? "sh";
}

function augmentTestPosixPath(env: Record<string, string | undefined>) {
  if (process.platform !== "win32") return;
  const entries = [
    "/usr/bin",
    "/bin",
    "C:\\Program Files\\Git\\usr\\bin",
    "C:\\Program Files\\Git\\bin",
  ].filter((entry) => entry.startsWith("/") || existsSync(entry));
  env.PATH = [...entries, env.PATH ?? ""].join(path.delimiter);
}

function rewriteWindowsPathsForGitShell(script: string) {
  if (process.platform !== "win32") return script;
  return script.replace(/([A-Za-z]):\\([^'"\s]*)/g, (_match, drive: string, rest: string) =>
    `/${drive.toLowerCase()}/${rest.replace(/\\/g, "/")}`,
  );
}

describe("command managed runtime", () => {
  const cleanupDirs: string[] = [];

  afterEach(async () => {
    while (cleanupDirs.length > 0) {
      const dir = cleanupDirs.pop();
      if (!dir) continue;
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it("keeps the runtime overlay out of sandbox workspace sync by default", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "paperclip-command-runtime-"));
    cleanupDirs.push(rootDir);

    const localWorkspaceDir = path.join(rootDir, "local-workspace");
    const remoteWorkspaceDir = path.join(rootDir, "remote-workspace");
    await mkdir(path.join(localWorkspaceDir, ".paperclip-runtime"), { recursive: true });
    await mkdir(remoteWorkspaceDir, { recursive: true });
    await writeFile(path.join(localWorkspaceDir, "README.md"), "local workspace\n", "utf8");
    await writeFile(path.join(localWorkspaceDir, ".paperclip-runtime", "state.json"), "{\"keep\":true}\n", "utf8");

    const calls: Array<{
      command: string;
      args?: string[];
      cwd?: string;
      env?: Record<string, string>;
      stdin?: string;
      timeoutMs?: number;
    }> = [];
    const runner = {
      execute: async (input: {
        command: string;
        args?: string[];
        cwd?: string;
        env?: Record<string, string>;
        stdin?: string;
        timeoutMs?: number;
      }): Promise<RunProcessResult> => {
        calls.push({ ...input });
        const startedAt = new Date().toISOString();
        const env = createChildProcessEnv(input.env);
        const command =
          input.command === "sh" || input.command === "bash"
            ? resolveTestPosixShellCommand(input.command)
            : input.command;
        const args = [...(input.args ?? [])];
        if (input.command === "sh" || input.command === "bash") {
          augmentTestPosixPath(env);
        }
        if (
          (input.command === "sh" || input.command === "bash") &&
          (args[0] === "-c" || args[0] === "-lc") &&
          typeof args[1] === "string"
        ) {
          args[1] = rewriteWindowsPathsForGitShell(args[1]);
        }
        try {
          const result = await execFileWithInput(command, args, {
            cwd: input.cwd,
            env,
            input: input.stdin,
            maxBuffer: 32 * 1024 * 1024,
            timeout: input.timeoutMs,
          });
          return {
            exitCode: 0,
            signal: null,
            timedOut: false,
            stdout: result.stdout,
            stderr: result.stderr,
            pid: null,
            startedAt,
          };
        } catch (error) {
          const err = error as NodeJS.ErrnoException & {
            stdout?: string;
            stderr?: string;
            code?: string | number | null;
            signal?: NodeJS.Signals | null;
            killed?: boolean;
          };
          return {
            exitCode: typeof err.code === "number" ? err.code : null,
            signal: err.signal ?? null,
            timedOut: Boolean(err.killed && input.timeoutMs),
            stdout: err.stdout ?? "",
            stderr: err.stderr ?? "",
            pid: null,
            startedAt,
          };
        }
      },
    };

    const prepared = await prepareCommandManagedRuntime({
      runner,
      spec: {
        remoteCwd: remoteWorkspaceDir,
        timeoutMs: 30_000,
      },
      adapterKey: "claude",
      workspaceLocalDir: localWorkspaceDir,
    });

    await expect(readFile(path.join(remoteWorkspaceDir, "README.md"), "utf8")).resolves.toBe("local workspace\n");
    await expect(readFile(path.join(remoteWorkspaceDir, ".paperclip-runtime", "state.json"), "utf8")).rejects
      .toMatchObject({ code: "ENOENT" });
    const uploadCalls = calls.filter((call) => call.args?.[1]?.includes("cat >>"));
    expect(uploadCalls.length).toBeGreaterThan(0);
    expect(uploadCalls.every((call) => typeof call.stdin === "string" && call.stdin.length <= 32 * 1024)).toBe(true);

    await mkdir(path.join(remoteWorkspaceDir, ".paperclip-runtime"), { recursive: true });
    await writeFile(path.join(remoteWorkspaceDir, "README.md"), "remote workspace\n", "utf8");
    await writeFile(path.join(remoteWorkspaceDir, ".paperclip-runtime", "remote-state.json"), "{\"remote\":true}\n", "utf8");
    await prepared.restoreWorkspace();

    await expect(readFile(path.join(localWorkspaceDir, "README.md"), "utf8")).resolves.toBe("remote workspace\n");
    await expect(readFile(path.join(localWorkspaceDir, ".paperclip-runtime", "state.json"), "utf8")).resolves
      .toBe("{\"keep\":true}\n");
    await expect(readFile(path.join(localWorkspaceDir, ".paperclip-runtime", "remote-state.json"), "utf8")).rejects
      .toMatchObject({ code: "ENOENT" });
  }, 30_000);

  it("runs setup commands from a stable root cwd when staging into a nested remote workspace dir", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "paperclip-command-runtime-nested-"));
    cleanupDirs.push(rootDir);

    const localWorkspaceDir = path.join(rootDir, "local-workspace");
    const remoteBaseDir = path.join(rootDir, "remote-base");
    const remoteWorkspaceDir = path.join(remoteBaseDir, ".paperclip-runtime", "runs", "test", "workspace");
    await mkdir(localWorkspaceDir, { recursive: true });
    await mkdir(remoteBaseDir, { recursive: true });
    await writeFile(path.join(localWorkspaceDir, "README.md"), "local workspace\n", "utf8");

    const calls: Array<{
      command: string;
      args?: string[];
      cwd?: string;
      env?: Record<string, string>;
      stdin?: string;
      timeoutMs?: number;
    }> = [];
    const runner = {
      execute: async (input: {
        command: string;
        args?: string[];
        cwd?: string;
        env?: Record<string, string>;
        stdin?: string;
        timeoutMs?: number;
      }): Promise<RunProcessResult> => {
        calls.push({ ...input });
        const startedAt = new Date().toISOString();
        const env = createChildProcessEnv(input.env);
        const command =
          input.command === "sh" || input.command === "bash"
            ? resolveTestPosixShellCommand(input.command)
            : input.command;
        const args = [...(input.args ?? [])];
        if (input.command === "sh" || input.command === "bash") {
          augmentTestPosixPath(env);
        }
        if (
          (input.command === "sh" || input.command === "bash") &&
          (args[0] === "-c" || args[0] === "-lc") &&
          typeof args[1] === "string"
        ) {
          args[1] = rewriteWindowsPathsForGitShell(args[1]);
        }
        try {
          const result = await execFileWithInput(command, args, {
            cwd: input.cwd,
            env,
            input: input.stdin,
            maxBuffer: 32 * 1024 * 1024,
            timeout: input.timeoutMs,
          });
          return {
            exitCode: 0,
            signal: null,
            timedOut: false,
            stdout: result.stdout,
            stderr: result.stderr,
            pid: null,
            startedAt,
          };
        } catch (error) {
          const err = error as NodeJS.ErrnoException & {
            stdout?: string;
            stderr?: string;
            code?: string | number | null;
            signal?: NodeJS.Signals | null;
            killed?: boolean;
          };
          return {
            exitCode: typeof err.code === "number" ? err.code : null,
            signal: err.signal ?? null,
            timedOut: Boolean(err.killed && input.timeoutMs),
            stdout: err.stdout ?? "",
            stderr: err.stderr ?? "",
            pid: null,
            startedAt,
          };
        }
      },
    };

    await prepareCommandManagedRuntime({
      runner,
      spec: {
        remoteCwd: remoteBaseDir,
        timeoutMs: 30_000,
      },
      adapterKey: "codex",
      workspaceLocalDir: localWorkspaceDir,
      workspaceRemoteDir: remoteWorkspaceDir,
    });

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.cwd === "/")).toBe(true);
    await expect(readFile(path.join(remoteWorkspaceDir, "README.md"), "utf8")).resolves.toBe("local workspace\n");
  }, 30_000);
});
