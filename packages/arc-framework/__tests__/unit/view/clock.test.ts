import { describe, expect, it, vi } from "vitest";

import { resolveViewClock } from "../../../src/lib/view/clock.js";

describe("resolveViewClock", () => {
  it("defaults to 24h when the user key is unset", async () => {
    await expect(resolveViewClock({
      cwd: "/repo",
      exec: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
      readFile: vi.fn(),
    })).resolves.toEqual({ clock: "24h", warnings: [] });
  });

  it("accepts 12h and warns while falling back for an invalid value", async () => {
    await expect(resolveViewClock({
      cwd: "/repo",
      exec: vi.fn().mockResolvedValue({ stdout: "12h\n", stderr: "" }),
      readFile: vi.fn(),
    })).resolves.toEqual({ clock: "12h", warnings: [] });
    await expect(resolveViewClock({
      cwd: "/repo",
      exec: vi.fn().mockResolvedValue({ stdout: "locale\n", stderr: "" }),
      readFile: vi.fn(),
    })).resolves.toEqual({
      clock: "24h",
      warnings: [expect.stringContaining("arc.viewClock")],
    });
  });
});
