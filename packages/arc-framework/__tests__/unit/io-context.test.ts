import { execPath } from "node:process";

import { describe, expect, it } from "vitest";

import { gitExec } from "../../src/lib/io-context.js";

describe("gitExec", () => {
  it("captures stdout beyond the execFile default buffer", async () => {
    const outputBytes = (1024 * 1024) + 1;

    const result = await gitExec(execPath, [
      "-e",
      `process.stdout.write("x".repeat(${outputBytes}))`,
    ]);

    expect(result.stdout).toHaveLength(outputBytes);
  });
});
