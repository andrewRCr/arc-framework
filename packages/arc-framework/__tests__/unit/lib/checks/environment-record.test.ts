/** Record projection boundaries reject unsupported embedded references and retain declared key constraints. */
import { expect, it } from "vitest";
import { z } from "zod";
import { environmentRecord } from "../../../../src/lib/checks/environment-record.js";

it("refuses reference-bearing value projections and accepts an inline repair", () => {
  expect(() => environmentRecord(z.record(z.string(), z.string().meta({ id: "referenced-binding" }))))
    .toThrow("Environment record projection must be inline");
  const repaired = environmentRecord(z.record(z.string(), z.string()));
  const input: unknown = JSON.parse('{"__proto__":"own value"}');
  expect(repaired.parse(input)).toEqual(input);
});

it("never restores a special key excluded by the declared grammar", () => {
  const schema = environmentRecord(z.record(z.string().regex(/^MODE$/u), z.string()));
  const invalid: unknown = JSON.parse('{"__proto__":"own value"}');
  expect(schema.safeParse(invalid).success).toBe(false);
  expect(schema.parse({ MODE: "repaired" })).toEqual({ MODE: "repaired" });
});
