/** Literal rewritten transport preserves the intended receiver and native pre-push authority. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

it.each(["default", "separate"] as const)("uses the authorized literal preimage and respects hook rejection (%s)", async layout => {
  const h = await refSyncFixture(layout), decoy = join(h.a.root, "decoy.git");
  await h.a.exec("git", ["init", "--bare", decoy]);
  await h.a.exec("git", ["config", "remote.origin.arc-state", "off"]);
  if (layout === "separate") await h.a.git(["remote", "remove", "backing"]);
  await h.a.exec("git", ["remote", "add", "upstream", "arc-safe"]);
  await h.a.exec("git", ["config", "remote.upstream.arc-state", "push"]);
  const configure = async (git: typeof h.a.git) => {
    await git(["config", `url.${h.origin}.insteadOf`, "arc-safe"]);
    await git(["config", "--add", `url.${h.b.root}.pushInsteadOf`, "arc-collision"]);
    await git(["config", "--add", `url.${h.b.root}.pushInsteadOf`, "arc-safe"]);
    await git(["config", `url.${decoy}.pushInsteadOf`, h.b.root]);
  };
  await configure(args => h.a.exec("git", args));
  const directory = join(h.a.root, "effective-hooks"), hook = join(directory, "pre-push"), log = join(directory, "calls");
  await mkdir(directory);
  await writeFile(hook, `#!/bin/sh\nprintf '%s\\n' "$1" "$2" >> '${log.replaceAll("\\", "/")}'\ncat >> '${log.replaceAll("\\", "/")}'\nprintf 'Effective receiver hook declined\\n' >&2\nexit 1\n`, { mode: 0o755 });
  const store = createRefStore({ ...h.a.ports, exec: (command, args, options) => h.a.ports.exec(command,
    args.includes("push") ? ["-c", `core.hooksPath=${directory}`, ...args] : args, options) });
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "effective.md", owner: { type: "person", name: "andrew" } });
  success(await store.write({ action: "put", reference, expected: null, content: "Intended receiver only.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  // An upstream publisher creates its separate store on the first write, even from an initially default layout.
  await configure(h.a.git);
  await h.a.git(["remote", "add", "arc-collision", decoy]);
  const tips = async (root: string) => (await h.a.exec("git", [`--git-dir=${root}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const before = await tips(join(h.b.root, ".git"));
  expect(success(await store.push()).publishes).toContainEqual(expect.objectContaining({ status: "failed",
    failure: expect.objectContaining({ message: expect.stringContaining("Effective receiver hook declined") }) }));
  expect(await tips(join(h.b.root, ".git"))).toBe(before);
  expect(await tips(decoy)).toBe("");
  const calls = (await readFile(log, "utf8")).trim().split("\n");
  expect(calls.slice(0, 2)).toEqual(["arc-safe", h.b.root]);
  expect(calls.filter(line => line === "arc-safe")).toHaveLength(1);
  await writeFile(hook, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  expect(success(await store.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  expect((await h.a.exec("git", [`--git-dir=${join(h.b.root, ".git")}`, "grep", "-F", "Intended receiver only.", "refs/arc/user/andrew/personal"])).stdout)
    .toContain("Intended receiver only.");
  expect(await tips(decoy)).toBe("");
}, 60_000);
