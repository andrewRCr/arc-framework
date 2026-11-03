/** The projection's own blob ids, compared with Git's. */
import { afterEach, describe, expect, it } from "vitest";
import { createTempRepoCore, removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { createExecaGitExecInput } from "../../../../src/lib/git/process-executor.js";
import { gitBlobId, storedBlobId, type ObjectFormat } from "../../../../src/lib/store/projection/blob-id.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";

const execInput = createExecaGitExecInput();
const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

async function hashObject(format: ObjectFormat, content: string): Promise<string> {
  const cwd = await createTempRepoCore({ prefix: "arc-projection-blob-", objectFormat: format });
  directories.push(cwd);
  return (await execInput(["hash-object", "--no-filters", "--stdin"], content, { cwd })).trim();
}

describe("the projection's blob ids", () => {
  it.each(["sha1", "sha256"] as const)("equal git hash-object's in a %s repository", async (format) => {
    for (const content of ["", "# Metadata: Alpha\n", "naïve — ✓ ünïcödé\nno trailing newline"]) {
      expect(gitBlobId(content, format)).toBe(await hashObject(format, content));
    }
  });

  it("hashes CRLF content as its LF form, with a Markdown file's stamp and notice lines stripped", async () => {
    const stored = "# Metadata: Alpha\n<!-- a comment of the person's own -->\n\n- **State:** Active\n";
    const expected = await hashObject("sha1", stored);
    const stamped = renderStampedFile({ content: stored, stamp: "9".repeat(40), notices: ["this file is protected"] });
    for (const text of [stored, stored.replaceAll("\n", "\r\n"), stamped, stamped.replaceAll("\n", "\r\n")]) {
      expect(storedBlobId(text, { format: "sha1", markdown: true })).toBe(expected);
    }
    const withoutComment = stored.replace("<!-- a comment of the person's own -->\n", "");
    expect(storedBlobId(withoutComment, { format: "sha1", markdown: true })).not.toBe(expected);
  });

  it("strips nothing from a file other than Markdown", () => {
    const text = `<!-- arc-base: ${"9".repeat(40)} -->\nkey: value\n`;
    expect(storedBlobId(text, { format: "sha1", markdown: false })).toBe(gitBlobId(text, "sha1"));
    expect(storedBlobId(text.replaceAll("\n", "\r\n"), { format: "sha1", markdown: false }))
      .toBe(gitBlobId(text, "sha1"));
  });
});
