/**
 * Unit tests for identity resolution utility.
 *
 * Tests the lookup sequence: git config arc.identity → slugified user.name → prompt,
 * and the slugify function for filesystem-safe identity strings.
 */

import { describe, it, expect, vi } from "vitest";
import { UserFacingError } from "../../../src/lib/errors.js";
import { readConfiguredIdentity, slugifyIdentity, resolveIdentity } from "../../../src/lib/git/identity.js";
import type { GitExec } from "../../../src/lib/git/index.js";

// --- slugifyIdentity ---

describe("slugifyIdentity", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugifyIdentity("Andrew Smith")).toBe("andrew-smith");
  });

  it("replaces dots with hyphens", () => {
    expect(slugifyIdentity("first.last")).toBe("first-last");
  });

  it("strips non-alphanumeric non-hyphen characters", () => {
    expect(slugifyIdentity("André O'Brien")).toBe("andr-obrien");
  });

  it("collapses consecutive separators", () => {
    expect(slugifyIdentity("Jane  . Doe")).toBe("jane-doe");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugifyIdentity(" .Hello. ")).toBe("hello");
  });

  it("handles single word", () => {
    expect(slugifyIdentity("andrew")).toBe("andrew");
  });

  it("handles empty string", () => {
    expect(slugifyIdentity("")).toBe("");
  });

  it("neutralizes path traversal attempts", () => {
    expect(slugifyIdentity("../../etc")).toBe("etc");
    expect(slugifyIdentity("../../../passwd")).toBe("passwd");
    expect(slugifyIdentity("foo/bar")).toBe("foobar");
    expect(slugifyIdentity("..")).toBe("");
  });
});

// --- resolveIdentity ---

/** Creates a mock GitExec that returns predefined values for config keys. */
function mockExec(configValues: Record<string, string>): GitExec {
  return vi.fn(async (_cmd: string, args: string[]) => {
    if (args[0] === "config" && args[1] === "--null" && args[2] === "--get") {
      const key = args[3];
      if (key && key in configValues) return { stdout: `${configValues[key]!}\0` };
      throw { exitCode: 1 };
    }
    if (args[0] === "config" && args[1] === "--get") {
      const key = args[2];
      if (key && key in configValues) {
        return { stdout: configValues[key]! + "\n" };
      }
      throw { exitCode: 1 };
    }
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  });
}

describe("resolveIdentity", () => {
  it("returns existing arc.identity from git config", async () => {
    const exec = mockExec({ "arc.identity": "andrew" });
    const result = await resolveIdentity({ exec });
    expect(result).toBe("andrew");
  });

  it("falls back to slugified user.name when arc.identity is not set", async () => {
    const exec = mockExec({ "user.name": "Andrew Smith" });
    const result = await resolveIdentity({ exec });
    expect(result).toBe("andrew-smith");
  });

  it("prompts when neither git config is available", async () => {
    const exec = mockExec({});
    const prompt = vi.fn(async () => "typed-name");
    const result = await resolveIdentity({ exec, prompt });
    expect(prompt).toHaveBeenCalledWith(
      expect.stringContaining("personal workspace"),
      undefined,
    );
    expect(result).toBe("typed-name");
  });

  it("passes slugified user.name as prompt default", async () => {
    // user.name exists but arc.identity doesn't — prompt should get the suggestion
    const exec = vi.fn(async (_cmd: string, args: string[]) => {
      if (args[0] === "config" && args[1] === "--null") throw { exitCode: 1 };
      if (args[0] === "config" && args[1] === "--get") {
        if (args[2] === "user.name") return { stdout: "Jane Doe\n" };
        throw new Error("not found");
      }
      throw new Error("unexpected");
    });
    const prompt = vi.fn(async () => "jane-doe");

    const result = await resolveIdentity({ exec, prompt });
    expect(prompt).toHaveBeenCalledWith(
      expect.stringContaining("personal workspace"),
      "jane-doe",
    );
    expect(result).toBe("jane-doe");
  });

  it("does not fall back when a configured identity is invalid", async () => {
    const exec = mockExec({ "arc.identity": " Andrew ", "user.name": "Fallback Name" });

    await expect(resolveIdentity({ exec })).rejects.toMatchObject({
      code: "identity.invalid",
      whatHappened: "Configured ARC identity is invalid",
      why: "arc.identity must be a lowercase alphanumeric slug whose segments are separated by single hyphens.",
      whatToDo: "Set a valid identity with:\n    git config --local arc.identity <identity>",
    });
  });

  it("returns null when no identity found and no prompt provided", async () => {
    const exec = mockExec({});
    const result = await resolveIdentity({ exec });
    expect(result).toBeNull();
  });

  it("returns null when prompt is cancelled (returns symbol)", async () => {
    const exec = mockExec({});
    const prompt = vi.fn(async () => Symbol("cancel") as unknown as string);
    const result = await resolveIdentity({ exec, prompt });
    expect(result).toBeNull();
  });

  it("prefers arc.identity over user.name", async () => {
    const exec = mockExec({
      "arc.identity": "custom-name",
      "user.name": "Different Name",
    });
    const result = await resolveIdentity({ exec });
    expect(result).toBe("custom-name");
  });
});

describe("readConfiguredIdentity", () => {
  it("returns a canonical configured value and null only for absence", async () => {
    await expect(readConfiguredIdentity(mockExec({ "arc.identity": "andrew" }))).resolves.toBe("andrew");
    await expect(readConfiguredIdentity(mockExec({}))).resolves.toBeNull();
  });

  it.each(["", " Andrew ", "two--segments", "../unsafe", "UPPER"])(
    "rejects present invalid configured bytes %j",
    async (value) => {
      await expect(readConfiguredIdentity(mockExec({ "arc.identity": value })))
        .rejects.toBeInstanceOf(UserFacingError);
    },
  );

  it("propagates non-absence Git failures unchanged", async () => {
    const failure = new Error("executor unavailable");
    const exec: GitExec = vi.fn(async () => { throw failure; });

    await expect(readConfiguredIdentity(exec)).rejects.toBe(failure);
  });

  it("requires exactly one terminal NUL delimiter", async () => {
    const missing: GitExec = vi.fn(async () => ({ stdout: "andrew" }));
    const repeated: GitExec = vi.fn(async () => ({ stdout: "andrew\0\0" }));

    await expect(readConfiguredIdentity(missing)).rejects.toMatchObject({ code: "identity.invalid" });
    await expect(readConfiguredIdentity(repeated)).rejects.toMatchObject({ code: "identity.invalid" });
  });
});
