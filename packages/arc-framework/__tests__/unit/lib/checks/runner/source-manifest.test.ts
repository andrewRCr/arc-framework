/** Canonical manifest bytes and whole-artifact digests match independent language vectors. */
import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { identifySourceManifest } from "../../../../../src/lib/checks/runner/source-manifest.js";
import { SourceManifestSchema } from "../../../../../src/lib/checks/runner/contract-source.js";
import { sourceManifestVectors } from "../../../../fixtures/checks/source-manifest-vectors.js";
import { assertSchemaAccepts } from "../../../../helpers/schema-assertion.js";
import { freezeSourcePresentation } from "../../../../../src/lib/checks/runner/source-presentation.js";
import { nodeSourcePresentationIO } from "../../../../../src/lib/checks/runner/source-io.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

it.each(sourceManifestVectors)("encodes $name with canonical field order and UTF-8 path order", ({ input, encoding, digest }) => {
  const identity = identifySourceManifest(input);
  expect(identity.encoding).toBe(encoding);
  expect(identity.digest).toBe(digest);
  expect(JSON.parse(identity.encoding)).toEqual(identity.manifest);
  assertSchemaAccepts(SourceManifestSchema, identity.manifest);
});

it("publishes the guide's encoding vectors and digests exactly as the fixture computes them", async () => {
  const guide = await readFile(new URL("../../../../../README.md", import.meta.url), "utf8");
  const section = guide.slice(guide.indexOf("### Exact cross-language encoding vectors"));
  const published = [...section.matchAll(/\*\*([\w-]+)\*\*\r?\n\r?\n```json\r?\n([^\r\n]*)\r?\n```\r?\n\r?\nDigest: `(sha256:[0-9a-f]{64})`\./gu)]
    .map(([, name, encoding, digest]) => ({ name, encoding, digest }));
  expect(published).toEqual(sourceManifestVectors.map(({ name, encoding, digest }) => ({ name, encoding, digest })));
});

it("writes canonical stored-name order and retains identity across storage locations", async () => {
  const root = await mkdtemp(join(tmpdir(), "arc-source-canonical-"));
  directories.push(root);
  await writeFile(join(root, "_a"), "first\n");
  await writeFile(join(root, "z"), "second\n");
  const map = (path: string) => path === join(root, "Z") ? join(root, "z") : path;
  const io = { ...nodeSourcePresentationIO,
    lstat: (path: string) => nodeSourcePresentationIO.lstat(map(path)),
    files: { ...nodeSourcePresentationIO.files,
      openInput: (path: string) => nodeSourcePresentationIO.files.openInput(map(path)),
    },
  };
  const coordinates = { tree: "a".repeat(40), merged: [] };
  const first = await freezeSourcePresentation(root, Buffer.from("Z\0_a\0"), coordinates, io);
  try {
    const second = await freezeSourcePresentation(root, Buffer.from("Z\0_a\0"), coordinates, io);
    try {
      expect(first.root).not.toBe(second.root);
      expect(first.manifestPath).not.toBe(second.manifestPath);
      expect(first.manifest.entries.map(entry => entry.path)).toEqual(["_a", "z"]);
      expect(first.digest).toBe(identifySourceManifest(first.manifest).digest);
      expect(first.digest).toBe(second.digest);
      expect(await readFile(first.manifestPath, "utf8")).toBe(identifySourceManifest(first.manifest).encoding);
      assertSchemaAccepts(SourceManifestSchema, first.manifest);
    } finally { await second.remove(); }
  } finally { await first.remove(); }
});
