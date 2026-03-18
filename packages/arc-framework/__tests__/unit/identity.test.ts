/**
 * Unit tests for identity resolution utility.
 *
 * Tests the lookup sequence: git config arc.identity → slugified user.name → prompt,
 * and the slugify function for filesystem-safe identity strings.
 */

import { describe, it, expect, vi } from "vitest";
import { slugifyIdentity, resolveIdentity } from "../../src/lib/identity.js";
import type { GitExec } from "../../src/lib/git.js";

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
});

// --- resolveIdentity ---

/** Creates a mock GitExec that returns predefined values for config keys. */
function mockExec(configValues: Record<string, string>): GitExec {
  return vi.fn(async (_cmd: string, args: string[]) => {
    if (args[0] === "config" && args[1] === "--get") {
      const key = args[2];
      if (key && key in configValues) {
        return { stdout: configValues[key]! + "\n" };
      }
      throw new Error(`Config key not found: ${key}`);
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
