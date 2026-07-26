/** Shared-corpus compatibility checks for full ARC configuration validation. */

import { describe, expect, it, vi } from "vitest";

import { CONFIG_COMPATIBILITY_CASES } from "../../fixtures/config/cases.js";
import { validateConfigFile } from "../../../src/commands/config/validate.js";

describe("configuration compatibility — full validator", () => {
  for (const fixture of CONFIG_COMPATIBILITY_CASES) {
    it(fixture.id, async () => {
      const readFile = fixture.config === null
        ? vi.fn().mockRejectedValue(new Error("ENOENT"))
        : vi.fn().mockResolvedValue(fixture.config);
      const result = await validateConfigFile({
        readPath: "/resolved/selected.yml",
        displayPath: "selected.yml",
        readFile,
      });

      expect(result).toMatchObject({
        passes: fixture.expected.validator.passes,
        warnings: fixture.expected.validator.warnings,
        errors: fixture.expected.validator.errors,
        exitCode: fixture.expected.validator.exitCode,
      });
      for (const line of fixture.expected.validator.lineIncludes) {
        expect(result.lines).toEqual(expect.arrayContaining([expect.stringContaining(line)]));
      }
    });
  }
});
