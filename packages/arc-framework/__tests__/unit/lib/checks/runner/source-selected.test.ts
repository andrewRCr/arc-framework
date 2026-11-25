/** Selected tree entry fidelity is independent from raw file-byte identity. */
import { expect, it } from "vitest";
import { scriptGitExec, scriptRawGitExec } from "../../../../helpers/git-exec-fake.js";
import { identifySourceManifest } from "../../../../../src/lib/checks/runner/source-manifest.js";
import { verifySelectedSourcePresentation } from "../../../../../src/lib/checks/runner/source-selected.js";
import type { SourceManifestEntry } from "../../../../../src/lib/checks/runner/contract-source.js";

const tree = "a".repeat(40);
const blob = "b".repeat(40);
function view(entry: SourceManifestEntry) {
  return { manifest: identifySourceManifest({ version: 1, coordinates: { tree, merged: [] }, entries: [entry] }).manifest,
    codePaths: new Map([["code", entry.path]]) };
}
function boundary(mode: string, target = "target") {
  return { git: scriptGitExec([]).exec, gitRaw: scriptRawGitExec([
    { match: ["ls-tree", "-r", "-z", "--full-tree", tree], responses: [{ stdout: Buffer.from(`${mode} ${mode === "160000" ? "commit" : "blob"} ${blob}\tcode\0`) }] },
    { match: ["cat-file", "blob", blob], responses: [{ stdout: Buffer.from(target) }] },
  ]).exec };
}
const regular: SourceManifestEntry = { path: "code", kind: "file", mode: 0o644, bytes: 0,
  digest: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" };

it("refuses a lost executable mode and accepts a repaired presentation", async () => {
  await expect(verifySelectedSourcePresentation(boundary("100755"), "/repo", view(regular))).rejects.toThrow(/executable mode/iu);
  await expect(verifySelectedSourcePresentation(boundary("100755"), "/repo", view({ ...regular, mode: 0o755 }))).resolves.toBeUndefined();
});

it("refuses a changed selected literal target and accepts the correct link", async () => {
  const link: SourceManifestEntry = { path: "code", kind: "symlink", target: "other" };
  await expect(verifySelectedSourcePresentation(boundary("120000"), "/repo", view(link))).rejects.toThrow(/link target/iu);
  await expect(verifySelectedSourcePresentation(boundary("120000"), "/repo", view({ ...link, target: "target" }))).resolves.toBeUndefined();
});

it("refuses unavailable catalog mapping and accepts repaired mapping", async () => {
  const source = view(regular);
  source.codePaths.clear();
  await expect(verifySelectedSourcePresentation(boundary("100644"), "/repo", source)).rejects.toThrow(/unavailable/iu);
  source.codePaths.set("code", "code");
  await expect(verifySelectedSourcePresentation(boundary("100644"), "/repo", source)).resolves.toBeUndefined();
});

it("refuses unsupported Git entry kinds instead of presenting their absence as a file", async () => {
  await expect(verifySelectedSourcePresentation(boundary("160000"), "/repo", view(regular))).rejects.toThrow(/unsupported entry kind/iu);
});
