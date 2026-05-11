import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { buildSnapshot, compareSnapshots, runCli } from "./i18n-key-audit.mjs";

async function withFixture(files, run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "paperclip-i18n-audit-"));
  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const absolutePath = path.join(root, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content);
    }
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function baseFiles({ en, zh, source = "" }) {
  return {
    "ui/public/locales/en/common.json": JSON.stringify(en, null, 2),
    "ui/public/locales/zh-CN/common.json": JSON.stringify(zh, null, 2),
    "ui/src/App.tsx": source,
  };
}

test("snapshot records locale definitions and static key usages", async () => {
  await withFixture(
    baseFiles({
      en: {
        "common.ok": "OK",
        "common.cancel": "Cancel",
        "common.unused": "Unused",
      },
      zh: {
        "common.ok": "确定",
        "common.cancel": "取消",
        "common.unused": "未使用",
      },
      source: `
        import { translateInstant } from "../i18n";
        export function App({ t, dynamicKey }) {
          return t("common.ok") + translateInstant("common.cancel") + t(dynamicKey);
        }
      `,
    }),
    async (root) => {
      const snapshot = await buildSnapshot({ root });

      assert.equal(snapshot.summary.keyCount, 3);
      assert.equal(snapshot.summary.unusedKeyCount, 1);
      assert.deepEqual(snapshot.unusedKeys, ["common.unused"]);
      assert.equal(snapshot.keys["common.ok"].definitions.en.value, "OK");
      assert.equal(snapshot.keys["common.ok"].definitions["zh-CN"].value, "确定");
      assert.equal(snapshot.keys["common.ok"].usageCount, 1);
      assert.equal(snapshot.keys["common.cancel"].usageCount, 1);
      assert.equal(snapshot.dynamicTranslationCallWarnings.length, 1);
      assert.equal(snapshot.dynamicTranslationCallWarnings[0].expression, "dynamicKey");
    },
  );
});

test("snapshot reports duplicate keys and locale parity gaps", async () => {
  await withFixture(
    {
      "ui/public/locales/en/common.json": `{
        "common.ok": "OK",
        "common.onlyEnglish": "Only English"
      }`,
      "ui/public/locales/zh-CN/common.json": `{
        "common.ok": "确定",
        "common.ok": "好的"
      }`,
      "ui/src/App.tsx": `export const label = "common.onlyEnglish";`,
    },
    async (root) => {
      const snapshot = await buildSnapshot({ root });

      assert.equal(snapshot.duplicates.length, 1);
      assert.equal(snapshot.duplicates[0].locale, "zh-CN");
      assert.equal(snapshot.duplicates[0].key, "common.ok");
      assert.deepEqual(snapshot.parity.missingByLocale["zh-CN"], ["common.onlyEnglish"]);
      assert.equal(snapshot.keys["common.onlyEnglish"].usageCount, 1);
    },
  );
});

test("snapshot scopes duplicate keys to the same JSON object", async () => {
  await withFixture(
    baseFiles({
      en: {
        common: {
          ok: "OK",
        },
        dialog: {
          ok: "OK",
        },
      },
      zh: {
        common: {
          ok: "确定",
        },
        dialog: {
          ok: "好的",
        },
      },
      source: `export const label = "common.ok";`,
    }),
    async (root) => {
      const snapshot = await buildSnapshot({ root });

      assert.equal(snapshot.duplicates.length, 0);
      assert.equal(snapshot.keys["common.ok"].usageCount, 1);
      assert.equal(snapshot.keys["dialog.ok"].usageCount, 0);
    },
  );
});

test("snapshot treats i18next plural variants as used through the base key", async () => {
  await withFixture(
    baseFiles({
      en: {
        "companies.agentCount": "{{count}} agents",
        "companies.agentCount_one": "{{count}} agent",
        "companies.agentCount_other": "{{count}} agents",
      },
      zh: {
        "companies.agentCount": "{{count}} 个智能体",
        "companies.agentCount_one": "{{count}} 个智能体",
        "companies.agentCount_other": "{{count}} 个智能体",
      },
      source: `
        export function AgentCount({ t }) {
          return t("companies.agentCount", { count: 2 });
        }
      `,
    }),
    async (root) => {
      const snapshot = await buildSnapshot({ root });

      assert.equal(snapshot.keys["companies.agentCount"].usageCount, 1);
      assert.equal(snapshot.keys["companies.agentCount_one"].usageCount, 1);
      assert.equal(snapshot.keys["companies.agentCount_other"].usageCount, 1);
      assert.equal(snapshot.keys["companies.agentCount_one"].usages[0].context.matchKind, "i18next-variant");
      assert.equal(snapshot.keys["companies.agentCount_one"].usages[0].context.matchedFrom, "companies.agentCount");
    },
  );
});

test("compare detects removed keys, new parity gaps, usage changes, duplicates, and zh-CN fallback", () => {
  const before = {
    summary: { generatedAt: "before", keyCount: 3 },
    keys: {
      "common.kept": {
        usageCount: 1,
        definitions: {
          en: { value: "Kept" },
          "zh-CN": { value: "保留" },
        },
      },
      "common.removed": {
        usageCount: 0,
        definitions: {
          en: { value: "Removed" },
          "zh-CN": { value: "已移除" },
        },
      },
      "common.rollback": {
        usageCount: 1,
        definitions: {
          en: { value: "Retry" },
          "zh-CN": { value: "重试" },
        },
      },
    },
    duplicates: [],
  };
  const after = {
    summary: { generatedAt: "after", keyCount: 3 },
    keys: {
      "common.kept": {
        usageCount: 3,
        definitions: {
          en: { value: "Kept" },
          "zh-CN": { value: "保留" },
        },
      },
      "common.newMissing": {
        usageCount: 0,
        definitions: {
          en: { value: "New" },
        },
      },
      "common.rollback": {
        usageCount: 1,
        definitions: {
          en: { value: "Retry" },
          "zh-CN": { value: "Retry" },
        },
      },
    },
    duplicates: [{ locale: "en", key: "common.kept" }],
  };

  const comparison = compareSnapshots(before, after);

  assert.deepEqual(comparison.removedKeys, ["common.removed"]);
  assert.deepEqual(comparison.newMissingParity, [{ key: "common.newMissing", locale: "zh-CN" }]);
  assert.deepEqual(comparison.usageChanges, [{ key: "common.kept", before: 1, after: 3, delta: 2 }]);
  assert.equal(comparison.duplicateKeys.length, 1);
  assert.equal(comparison.suspiciousZhFallbacks[0].key, "common.rollback");
  assert.equal(comparison.failures.length, 6);
});

test("snapshot CLI writes JSON and exits non-zero on duplicate keys", async () => {
  await withFixture(
    {
      "ui/public/locales/en/common.json": `{
        "common.ok": "OK"
      }`,
      "ui/public/locales/zh-CN/common.json": `{
        "common.ok": "确定",
        "common.ok": "好的"
      }`,
      "ui/src/App.tsx": `export const label = "common.ok";`,
    },
    async (root) => {
      const output = path.join(root, ".omx/i18n-key-audit/current.json");
      const exitCode = await runCli(["snapshot", "--root", root, "--out", output]);
      const snapshot = JSON.parse(await readFile(output, "utf8"));

      assert.equal(exitCode, 1);
      assert.equal(snapshot.duplicates.length, 1);
      assert.equal(snapshot.keys["common.ok"].usageCount, 1);
    },
  );
});
