/** Active merge selection retains conflict history after index stages disappear. */
import { expect, it } from "vitest";
import { readMergeCheckPaths } from "../../../../src/lib/checks/merge.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
const head = "a".repeat(40);
const parent = "b".repeat(40);
const tree = "c".repeat(40);

it.each([
  { path: "src/two\nlines.ts", record: "#\tsrc/two\n# lines.ts\n" },
  { path: "src/two\r\nlines.ts", record: "#\tsrc/two\r\n# lines.ts\n" },
  { path: "src/two\n\n\tlines.ts\n", record: ";\tsrc/two\n;\n;\tlines.ts\n;\n", prefix: ";" },
])("retains the complete native multiline conflict $path", async ({ path, record, prefix = "#" }) => {
  const { exec } = scriptGitExec([
    { match: { prefix: ["rev-parse"] }, responses: [{ stdout: "/private/MERGE_HEAD", stderr: "" }, { stdout: "/private/MERGE_MSG", stderr: "" }] },
    { match: { prefix: ["ls-tree"] }, responses: [{ stdout: `${path}\0`, stderr: "" }] },
    { match: { prefix: ["diff", "--name-only", "-z"] }, responses: [{ stdout: "", stderr: "" }] },
  ]);
  const observed = await readMergeCheckPaths(exec, "/repository", head, tree, async name =>
    name.endsWith("MERGE_HEAD") ? `${parent}\n` : `Merge branch incoming\n\n${prefix} Conflicts:\n${record}`);
  expect(observed).toEqual({ merged: [parent], paths: [path] });
});

it("preserves uncertainty when native records have multiple complete pathname interpretations", async () => {
  const { exec } = scriptGitExec([
    { match: { prefix: ["rev-parse"] }, responses: [{ stdout: "/private/MERGE_HEAD", stderr: "" }, { stdout: "/private/MERGE_MSG", stderr: "" }] },
    { match: { prefix: ["ls-tree"] }, responses: [{ stdout: "src/two\n\tlines.ts\0src/two\0lines.ts\0", stderr: "" }] },
    { match: { prefix: ["diff", "--name-only", "-z"] }, responses: [{ stdout: "src/authored.ts\0", stderr: "" }] },
  ]);
  const observed = await readMergeCheckPaths(exec, "/repository", head, tree, async name =>
    name.endsWith("MERGE_HEAD") ? `${parent}\n` : "Merge branch incoming\n\n# Conflicts:\n#\tsrc/two\n#\tlines.ts\n");
  expect(observed).toEqual({ merged: [parent], paths: ["src/authored.ts"], unresolved: true });
});

it("does not invent merge selection when MERGE_HEAD is absent", async () => {
  const { exec } = scriptGitExec([{ match: { prefix: ["rev-parse"] }, responses: [{ stdout: "/private/MERGE_HEAD", stderr: "" }] }]);
  await expect(readMergeCheckPaths(exec, "/repository", head, tree, async () => {
    throw Object.assign(new Error("absent"), { code: "ENOENT" });
  })).resolves.toBeUndefined();
});

it.each([40, 64])("retains every complete %s-character incoming parent with an empty conclusion", async length => {
  const parents = ["b".repeat(length), "d".repeat(length)];
  const { exec } = scriptGitExec([
    { match: { prefix: ["rev-parse"] }, responses: [{ stdout: "/private/MERGE_HEAD", stderr: "" }, { stdout: "/private/MERGE_MSG", stderr: "" }] },
    { match: { prefix: ["diff", "--name-only", "-z"] }, responses: [{ stdout: "", stderr: "" }] },
  ]);
  await expect(readMergeCheckPaths(exec, "/repository", "a".repeat(length), "c".repeat(length), async path =>
    path.endsWith("MERGE_HEAD") ? `${parents.join("\n")}\n` : "Merge branches\n"))
    .resolves.toEqual({ merged: parents, paths: [] });
});

it("unites historical conflicts with staged paths that differ from every parent", async () => {
  const root = "/repository";
  const metadata = new Map([
    ["/private/MERGE_HEAD", `${parent}\n`],
    ["/private/MERGE_MSG", "Merge branch incoming\n\n# Conflicts:\n#\tsrc/ours.txt\n\tsrc/both.txt\n"],
  ]);
  const { exec } = scriptGitExec([
    { match: ["rev-parse", "--path-format=absolute", "--git-path", "MERGE_HEAD"],
      responses: [{ stdout: "/private/MERGE_HEAD", stderr: "" }] },
    { match: ["rev-parse", "--path-format=absolute", "--git-path", "MERGE_MSG"],
      responses: [{ stdout: "/private/MERGE_MSG", stderr: "" }] },
    { match: { prefix: ["ls-tree"] }, responses: [{ stdout: "src/ours.txt\0src/both.txt\0", stderr: "" }] },
    { match: ["diff", "--name-only", "-z", "--no-renames", tree, head, parent, "--"],
      responses: [{ stdout: "src/both.txt\0src/resolution.txt\0", stderr: "" }] },
  ]);
  const observed = await readMergeCheckPaths(exec, root, head, tree, async path => {
    const content = metadata.get(path);
    if (content === undefined) throw new Error(`Missing fixture metadata: ${path}`);
    return content;
  });
  expect(observed).toEqual({ merged: [parent], paths: ["src/ours.txt", "src/both.txt", "src/resolution.txt"] });
});

it.each([";", "//"])("retains historical conflicts with the recorded %s comment prefix", async prefix => {
  const { exec } = scriptGitExec([
    { match: { prefix: ["rev-parse"] }, responses: [{ stdout: "/private/MERGE_HEAD", stderr: "" }, { stdout: "/private/MERGE_MSG", stderr: "" }] },
    { match: { prefix: ["diff", "--name-only", "-z"] }, responses: [{ stdout: "", stderr: "" }] },
    { match: { prefix: ["ls-tree"] }, responses: [{ stdout: "src/ours.txt\0", stderr: "" }] },
  ]);
  const observed = await readMergeCheckPaths(exec, "/repository", head, tree, async path =>
    path.endsWith("MERGE_HEAD") ? `${parent}\n` : `Merge branch incoming\n\n${prefix} Conflicts:\n${prefix}\tsrc/ours.txt\n`);
  expect(observed).toEqual({ merged: [parent], paths: ["src/ours.txt"] });
});
