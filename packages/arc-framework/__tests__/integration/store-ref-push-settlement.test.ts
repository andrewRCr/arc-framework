import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";

const ref = "refs/arc/user/andrew/personal";
const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "draft.md", owner: { type: "person", name: "andrew" } });
const provenance = { verb: "user", lifecycleAction: "save" };

it.each(["default", "separate", "upstream"] as const)("records the published tip and makes its next listing empty (%s)", async (mode) => {
  const h = await refSyncFixture(mode === "upstream" ? "separate" : mode);
  const remote = mode === "upstream" ? "upstream" : h.remoteName;
  if (mode === "upstream") {
    await h.a.git(["remote", "remove", "backing"]);
    await h.a.exec("git", ["config", "remote.origin.arc-state", "off"]);
    await h.a.exec("git", ["remote", "add", "upstream", "arc-upstream-state:"]);
    await h.a.exec("git", ["config", "remote.upstream.arc-state", "push"]);
    await h.a.exec("git", ["config", `url.${h.origin}.insteadOf`, "arc-upstream-state:"]);
  }
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "pending\n", provenance }));
  success(await h.a.store.push());
  const tip = (await h.a.git(["rev-parse", ref])).stdout;
  expect((await h.a.git(["for-each-ref", "--format=%(objectname)", `refs/arc-remotes/${remote}/user/andrew/personal`])).stdout).toBe(tip);
  const hooks = join(h.a.root, "deny-push");
  await mkdir(hooks);
  await writeFile(join(hooks, "pre-push"), '#!/bin/sh\nprintf "unexpected publication attempt\\n" >&2\nexit 1\n', { mode: 0o755 });
  const publisher = createRefStore({ ...h.a.ports, exec: (command, args, options) =>
    h.a.ports.exec(command, args.includes("push") ? ["-c", `core.hooksPath=${hooks}`, ...args] : args, options) });
  success(await publisher.push());
  expect((await h.remote("git", ["rev-parse", ref])).stdout).toBe(tip);
});

it.each(["default", "separate"] as const)("settles an unknown server rejection as a race when the fetched state moved (%s)", async (layout) => {
  const h = await refSyncFixture(layout);
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "common\n", provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const local = RecordReferenceSchema.parse({ ...reference, key: "local.md" });
  const incoming = RecordReferenceSchema.parse({ ...reference, key: "remote.md" });
  success(await h.a.store.write({ action: "put", reference: local, expected: null, content: "from a\n", provenance }));
  success(await h.b.store.write({ action: "put", reference: incoming, expected: null, content: "from b\n", provenance }));
  const otherTip = (await h.b.git(["rev-parse", ref])).stdout;
  await h.b.git(["push", h.remoteName, `${ref}:refs/test/state-race`]);
  const once = join(h.origin, "reject-once");
  await writeFile(once, "");
  const hook = join(h.origin, "hooks", "update");
  await writeFile(hook, `#!/bin/sh
if test -f '${once}'; then
  rm '${once}'
  git update-ref "$1" '${otherTip}' "$2" || exit 2
  printf 'state policy reported a busy receiver\\n' >&2
  exit 1
fi
exit 0
`, { mode: 0o755 });
  let armed = true;
  const publisher = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
    if (!armed || !args.includes("push")) return h.a.ports.exec(command, args, options);
    armed = false;
    try { return await h.a.ports.exec(command, args, options); }
    catch (error) { expect((await h.remote("git", ["rev-parse", ref])).stdout).toBe(otherTip); throw error; }
  } });
  const result = success(await publisher.push());
  expect(result.pulls.length).toBeGreaterThan(1);
  success(await h.b.store.pull());
  expect(success(await h.b.store.read({ reference: local })).content).toBe("from a\n");
  expect(success(await h.b.store.read({ reference: incoming })).content).toBe("from b\n");
});

it.each(["default", "separate"] as const)("settles an unknown server rejection as terminal when the fetched state did not move (%s)", async (layout) => {
  const h = await refSyncFixture(layout);
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "common\n", provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const local = reference;
  const hook = join(h.origin, "hooks", "update");
  const before = success(await h.a.store.read({ reference: local }));
  success(await h.a.store.write({ action: "put", reference: local, expected: before.version, content: "still local\n", provenance }));
  await writeFile(hook, '#!/bin/sh\nprintf "state policy requires repair\\n" >&2\nexit 1\n', { mode: 0o755 });
  const refused = success(await h.a.store.push());
  expect(refused.publishes).toEqual([expect.objectContaining({ retryCount: 1, waitedMs: expect.any(Number) })]);
  expect(refused.publishes).toEqual([expect.objectContaining({ status: "failed", failure: expect.objectContaining({
    code: "refused", class: "terminal", message: expect.stringContaining("remote: state policy requires repair"),
  }) })]);
  await unlink(hook);
  success(await h.a.store.push()); success(await h.b.store.pull());
  expect(success(await h.b.store.read({ reference: local })).content).toBe("still local\n");
});

it.each(["default", "separate"] as const)("keeps another pull's newer tracking value when acknowledging its earlier push (%s)", async (layout) => {
  const h = await refSyncFixture(layout);
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "first\n", provenance }));
  let armed = true, newer = "";
  const publisher = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
    const result = await h.a.ports.exec(command, args, options);
    if (armed && args.includes("push")) {
      armed = false;
      success(await h.b.store.pull());
      const before = success(await h.b.store.read({ reference }));
      success(await h.b.store.write({ action: "put", reference, expected: before.version, content: "newer\n", provenance }));
      await h.b.git(["push", h.remoteName, `${ref}:${ref}`]);
      newer = (await h.b.git(["rev-parse", ref])).stdout;
      success(await h.a.store.pull());
    }
    return result;
  } });
  success(await publisher.push());
  expect((await h.a.git(["rev-parse", `refs/arc-remotes/${h.remoteName}/user/andrew/personal`])).stdout).toBe(newer);
  expect(success(await h.a.store.read({ reference })).content).toBe("newer\n");
});
