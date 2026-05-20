import { describe, expect, it } from "vitest";
import { isDatabaseErrorCode, isUniqueViolation } from "../services/db-errors.js";

describe("database error helpers", () => {
  it("detects raw postgres error codes", () => {
    expect(isDatabaseErrorCode({ code: "23505" }, "23505")).toBe(true);
    expect(isDatabaseErrorCode({ code: "23505" }, "22P02")).toBe(false);
  });

  it("detects raw unique violations by constraint", () => {
    expect(isUniqueViolation({ code: "23505", constraint: "widgets_name_uq" }, "widgets_name_uq")).toBe(true);
    expect(isUniqueViolation({ code: "23505", constraint_name: "widgets_name_uq" }, "widgets_name_uq")).toBe(true);
    expect(isUniqueViolation({ code: "23505", constraint: "widgets_name_uq" }, "other_uq")).toBe(false);
  });

  it("detects Drizzle-wrapped unique violations", () => {
    const error = {
      message: "Failed query: insert into widgets ...",
      cause: { code: "23505", constraint: "widgets_name_uq" },
    };

    expect(isUniqueViolation(error, "widgets_name_uq")).toBe(true);
  });

  it("walks nested cause chains", () => {
    const error = {
      message: "outer",
      cause: {
        message: "middle",
        cause: {
          code: "23505",
          message: 'duplicate key value violates unique constraint "widgets_name_uq"',
        },
      },
    };

    expect(isUniqueViolation(error, "widgets_name_uq")).toBe(true);
  });
});
