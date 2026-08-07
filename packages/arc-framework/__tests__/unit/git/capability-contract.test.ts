import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("Git capability contract", () => {
  it("requires the first upstream Git release with local-only object access", () => {
    const packagePath = fileURLToPath(new URL("../../../package.json", import.meta.url));
    const manifest = JSON.parse(readFileSync(packagePath, "utf8")) as {
      engines?: { git?: string };
    };

    expect(manifest.engines?.git).toBe(">=2.45");
  });
});
