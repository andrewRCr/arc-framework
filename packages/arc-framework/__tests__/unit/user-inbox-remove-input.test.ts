import { describe, expect, it } from "vitest";

import { UserInboxRemoveInputSchema } from "../../src/handlers/user-inbox-remove-input.js";

const title = "Capture with `code` and \"quotes\"";

describe("inbox-remove title-source diagnostics", () => {
  it.each([
    [{ literal: title, inboxTitleFile: "-" }, [
      `positional title ${JSON.stringify(title)}`, '--inbox-title-file "-"',
    ]],
    [{ literal: title, inboxEntryFile: "entry.txt" }, [
      `positional title ${JSON.stringify(title)}`, '--inbox-entry-file "entry.txt"',
    ]],
    [{ inboxTitleFile: "title.txt", inboxEntryFile: "entry.txt" }, [
      '--inbox-title-file "title.txt"', '--inbox-entry-file "entry.txt"',
    ]],
    [{ literal: title, inboxTitleFile: "title.txt", inboxEntryFile: "entry.txt" }, [
      `positional title ${JSON.stringify(title)}`, '--inbox-title-file "title.txt"', '--inbox-entry-file "entry.txt"',
    ]],
    [{}, ["none"]],
  ])("names the supplied sources and valid retry forms for %j", (input, sources) => {
    const result = UserInboxRemoveInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected a source-selection refusal");
    const message = result.error.issues.map((issue) => issue.message).join("\n");
    for (const source of sources) expect(message).toContain(source);
    expect(message).toContain("arc user inbox-remove <title>");
    expect(message).toContain("arc user inbox-remove --inbox-title-file <path>");
    expect(message).toContain("arc user inbox-remove --inbox-entry-file <path>");
  });
});
