import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  normalizeInboxEntryTitle,
  resolveInboxEntryOperand,
} from "../../src/lib/inbox-entry-operand.js";

describe("normalizeInboxEntryTitle", () => {
  it("extracts the bold title from a full H3 managed-entry heading", () => {
    expect(normalizeInboxEntryTitle("### `[ ]` **Clarify file-backed inbox title operands**")).toBe(
      "Clarify file-backed inbox title operands",
    );
    expect(normalizeInboxEntryTitle("### [ ] **Plain checkbox title**")).toBe("Plain checkbox title");
  });

  it("leaves a plain title unchanged", () => {
    expect(normalizeInboxEntryTitle("Ordinary capture title")).toBe("Ordinary capture title");
  });
});

describe("resolveInboxEntryOperand", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("preserves literal boundary whitespace without reading another source", async () => {
    const readFile = vi.fn();
    const readStdin = vi.fn();

    await expect(resolveInboxEntryOperand(
      { literal: "  Ordinary capture title  " },
      { readFile, readStdin },
    )).resolves.toBe("  Ordinary capture title  ");
    expect(readFile).not.toHaveBeenCalled();
    expect(readStdin).not.toHaveBeenCalled();
  });

  it("normalizes an H3-shaped file line to the inner bold title", async () => {
    const readFile = vi.fn().mockResolvedValue("### [ ] **Clarify file-backed inbox title operands**\n");
    await expect(resolveInboxEntryOperand(
      { file: "/tmp/inbox-entry" },
      { readFile, readStdin: vi.fn() },
    )).resolves.toBe("Clarify file-backed inbox title operands");
  });

  it("rejects a literal title containing a trailing newline", async () => {
    const readFile = vi.fn();
    const readStdin = vi.fn();

    await expect(resolveInboxEntryOperand(
      { literal: "Ordinary capture title\n" },
      { readFile, readStdin },
    )).rejects.toThrow("must be a single line");
    expect(readFile).not.toHaveBeenCalled();
    expect(readStdin).not.toHaveBeenCalled();
  });

  it("reads a Markdown-bearing title from a file without interpreting it", async () => {
    const title = "Run `arc user inbox-remove` after $(capture)";
    const readFile = vi.fn().mockResolvedValue(`${title}\n`);
    const readStdin = vi.fn();

    await expect(resolveInboxEntryOperand(
      { file: "/tmp/inbox-entry" },
      { readFile, readStdin },
    )).resolves.toBe(title);
  });

  it("reads the title from stdin when the file operand is a dash", async () => {
    const readFile = vi.fn();
    const readStdin = vi.fn().mockResolvedValue("Capture with `inline code`\n");

    await expect(resolveInboxEntryOperand(
      { file: "-" },
      { readFile, readStdin },
    )).resolves.toBe("Capture with `inline code`");
    expect(readFile).not.toHaveBeenCalled();
  });

  it.each([
    [{}, "Provide exactly one inbox entry"],
    [{ literal: "One", file: "/tmp/title" }, "Provide exactly one inbox entry"],
    [{ literal: "" }, "must not be empty"],
  ])("rejects invalid source selection or empty input", async (operand, message) => {
    await expect(resolveInboxEntryOperand(
      operand,
      { readFile: vi.fn(), readStdin: vi.fn() },
    )).rejects.toThrow(message);
  });

  it("mentions both file flag names when the source selection is invalid", async () => {
    await expect(resolveInboxEntryOperand(
      {},
      { readFile: vi.fn(), readStdin: vi.fn() },
    )).rejects.toThrow(/--inbox-title-file/);
    await expect(resolveInboxEntryOperand(
      {},
      { readFile: vi.fn(), readStdin: vi.fn() },
    )).rejects.toThrow(/--inbox-entry-file/);
  });

  it.each(["First\nSecond", "First\n\n", "First\0Second"])("rejects a non-title payload", async (payload) => {
    await expect(resolveInboxEntryOperand(
      { file: "/tmp/title" },
      { readFile: vi.fn().mockResolvedValue(payload), readStdin: vi.fn() },
    )).rejects.toThrow("must be a single line");
  });

  it("surfaces file read failures", async () => {
    await expect(resolveInboxEntryOperand(
      { file: "/missing/title" },
      { readFile: vi.fn().mockRejectedValue(new Error("ENOENT")), readStdin: vi.fn() },
    )).rejects.toThrow("ENOENT");
  });
});
