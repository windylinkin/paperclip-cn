import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { companies, createDb, environmentLeases, environments } from "@penclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { companyService } from "../services/companies.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;
const EMBEDDED_POSTGRES_TIMEOUT = process.platform === "win32" ? 60_000 : 20_000;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres company service tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("companyService", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-companies-service-");
    db = createDb(tempDb.connectionString);
  }, EMBEDDED_POSTGRES_TIMEOUT);

  afterEach(async () => {
    await db.delete(environmentLeases);
    await db.delete(environments);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("retries issue prefix allocation after a wrapped unique conflict", async () => {
    const svc = companyService(db);

    const first = await svc.create({ name: "bigdata", budgetMonthlyCents: 0 });
    const second = await svc.create({ name: "bigdata1", budgetMonthlyCents: 0 });

    expect(first.issuePrefix).toBe("BIG");
    expect(second.issuePrefix).toBe("BIGA");
  });
});
