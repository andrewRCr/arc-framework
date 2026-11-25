/** Fix-corpus acquisition preserves provider and Git failures without substituting another list. */
import { expect, it } from "vitest";
import { resolveMarkdownFixCorpus, type MarkdownFixIO } from "../../../src/lib/markdown/fix-plan.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";

function io(): MarkdownFixIO {
  return {
    exec: scriptGitExec([{ match: { prefix: ["ls-files"] }, responses: [{ stdout: "" }] }]).exec,
    rawGit: async () => { throw new Error("unexpected raw Git access"); },
    readProjectedSelection: async () => ({ status: "ok", paths: [] }),
    lstat: async () => { throw new Error("unexpected file access"); },
    realpath: async path => path,
    readText: async () => { throw new Error("unexpected content access"); },
  };
}

it.each([false, true])("refuses unavailable projection acquisition and recovers (throws=%s)", async throws => {
  const boundary = io();
  boundary.readProjectedSelection = async () => {
    if (throws) throw new Error("projection offline");
    return { status: "unavailable", reason: "projection offline" };
  };
  await expect(resolveMarkdownFixCorpus("/repo", boundary)).rejects.toThrow("projection offline");
  boundary.readProjectedSelection = async () => ({ status: "ok", paths: [] });
  await expect(resolveMarkdownFixCorpus("/repo", boundary)).resolves.toMatchObject({ paths: [] });
});

it("preserves Git enumeration failures instead of treating them as an empty corpus", async () => {
  const boundary = io();
  boundary.exec = scriptGitExec([{ match: { prefix: ["ls-files"] },
    responses: [{ failure: { exitCode: 128, stderr: "index unreadable" } }] }]).exec;
  await expect(resolveMarkdownFixCorpus("/repo", boundary)).rejects.toMatchObject({ code: "markdown.selection-failed" });
});
