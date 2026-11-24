/** Persist handoff requests and their computed anchors through the packaged CLI. */
import { execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { expect, it } from "vitest";

import { git, runArc, runArcWithStdin } from "./helpers.js";
import { seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import { competingStoreWriter, expectExit, fixtureStore, markerPath, SESSION_COMMAND_TIMEOUT_MS,
  sessionIdentity, sessionRepo, stored } from "../helpers/store-session-personal-fixture.js";
import { HandoffWriteResultSchema } from "../../src/lib/handoff/write-schema.js";
import { writeMetaNextAction } from "../../src/lib/store/kinds/meta/writers.js";

const fileRequest = { schemaVersion: 1, sessionContext: "Prior context\n\n- Keep this first.", nextAction: "Continue",
  sessionType: "execution" };
const replacement = { schemaVersion: 1, sessionContext: "Replacement context\n\n- Keep this next.", nextAction: "Continue after repair" };
const stdinArgs = ["--skip-projection", "handoff", "write", "-"];

async function fixture() {
  const root = await sessionRepo();
  const { meta } = await seedWorkUnit(root, "handoff-subject", { identity: sessionIdentity, bind: root,
    meta: { owner: sessionIdentity, state: "Planning", currentWorkflow: "draft-design" } });
  const store = fixtureStore(root);
  const read = async () => stored(await store.read({ reference: meta.reference }));
  const marker = await readFile(markerPath(root));
  const head = await git(root, ["rev-parse", "HEAD"]);
  const localRefs = () => git(root, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads"]);
  const refs = await localRefs();
  const run = async (request: unknown, { exit = 0, env }: { exit?: number; env?: NodeJS.ProcessEnv } = {}) => {
    const result = await runArcWithStdin(stdinArgs, root, JSON.stringify(request), { env });
    expectExit(stdinArgs, result, exit);
    return HandoffWriteResultSchema.parse(JSON.parse(result.stdout));
  };
  const unchangedCheckout = async () => {
    expect(await readFile(markerPath(root))).toEqual(marker);
    expect(await git(root, ["rev-parse", "HEAD"])).toBe(head);
    expect(await localRefs()).toBe(refs);
  };
  return { root, store, meta, read, head, run, unchangedCheckout };
}

it("computes file handoff anchors, refuses forged anchors and escaped sections, and replaces context from repaired stdin", async () => {
  const f = await fixture();
  const input = join(f.root, ".git", "handoff.json");
  const fileArgs = ["--skip-projection", "handoff", "write", input];
  const version = stored(await f.store.version());
  await writeFile(input, JSON.stringify(fileRequest));
  const first = await runArc(fileArgs, f.root);
  expectExit(fileArgs, first);
  expect(HandoffWriteResultSchema.parse(JSON.parse(first.stdout))).toMatchObject({
    status: "written", reference: f.meta.reference, stateAtHandoff: version, commitAtHandoff: f.head,
    maintenance: { growth: [], contention: null }, diagnostics: [],
  });
  const written = await f.read();
  expect(written.fields).toMatchObject({ sessionContext: fileRequest.sessionContext, nextAction: fileRequest.nextAction,
    sessionType: "execution", stateAtHandoff: version, commitAtHandoff: f.head });
  const basis = stored(await f.store.version());
  const history = stored(await f.store.history({ reference: f.meta.reference }));

  for (const [request, condition] of [
    [{ ...replacement, stateAtHandoff: version }, "stateAtHandoff"],
    [{ ...replacement, commitAtHandoff: f.head }, "commitAtHandoff"],
    [{ ...replacement, sessionContext: "Keep\n## Escaped section" }, "## Escaped section"],
    [{ ...replacement, sessionContext: "Keep\n  ---  " }, "---"],
  ] as const) {
    expect(await f.run(request, { exit: 1 })).toMatchObject({ status: "refused", refusal: {
      code: "invalid-handoff-request", condition: expect.stringContaining(condition),
      remedy: { text: expect.stringMatching(/repair|rewrite/iu) },
    } });
    expect(stored(await f.store.version())).toBe(basis);
    expect(await f.read()).toEqual(written);
    expect(stored(await f.store.history({ reference: f.meta.reference }))).toEqual(history);
    await f.unchangedCheckout();
  }

  expect(await f.run(replacement)).toMatchObject({ status: "written", reference: f.meta.reference,
    stateAtHandoff: basis, commitAtHandoff: f.head });
  const repaired = await f.read();
  expect(repaired.fields).toMatchObject({ sessionContext: replacement.sessionContext, nextAction: replacement.nextAction,
    sessionType: null, stateAtHandoff: basis, commitAtHandoff: f.head });
  expect(repaired.content).not.toContain("Prior context");
  expect(stored(await f.store.history({ reference: f.meta.reference }))).toHaveLength(history.length + 1);
  await f.unchangedCheckout();
}, SESSION_COMMAND_TIMEOUT_MS);

it("refuses conflicted handoff metadata and writes after the retained conflict is resolved", async () => {
  const f = await fixture();
  const initial = await f.read();
  const put = { action: "put" as const, reference: initial.reference, expected: initial.version,
    placement: { kind: "active" as const }, provenance: { verb: "fixture", lifecycleAction: "update" } };
  const rival = await competingStoreWriter(f.root, f.store);
  const remote = stored(await rival.read({ reference: initial.reference }));
  stored(await f.store.write({ ...put, content: writeMetaNextAction(initial.content, "Local next action") }));
  stored(await rival.write({ ...put, expected: remote.version, content: writeMetaNextAction(remote.content, "Concurrent next action") }));
  stored(await rival.push());
  stored(await f.store.pull());
  const disputed = await f.read();
  expect(disputed.conflicts).toHaveLength(1);
  const before = stored(await f.store.version());

  expect(await f.run(replacement, { exit: 1 })).toMatchObject({ status: "refused", refusal: {
    code: "work-unit-unreadable", remedy: { text: expect.stringContaining("Resolve its meta conflicts") },
  } });
  expect(await f.read()).toEqual(disputed);
  expect(stored(await f.store.version())).toBe(before);
  await f.unchangedCheckout();

  stored(await f.store.write({ ...put, expected: disputed.version, resolves: disputed.conflicts, content: initial.content,
    provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  const basis = stored(await f.store.version());
  expect(await f.run(replacement)).toMatchObject({ status: "written", stateAtHandoff: basis, commitAtHandoff: f.head });
  expect(await f.read()).toMatchObject({ reference: f.meta.reference, conflicts: [],
    fields: { nextAction: replacement.nextAction, stateAtHandoff: basis } });
  await f.unchangedCheckout();
}, SESSION_COMMAND_TIMEOUT_MS);

it("reports only exceeded local maintenance measurements from the real ref history", async () => {
  const f = await fixture();
  const storeDir = `--git-dir=${join(f.root, ".git", "arc", "store")}`;
  const ref = `refs/arc/user/${sessionIdentity}/personal`;
  const original = await git(f.root, [storeDir, "rev-parse", ref]);
  const initialCount = Number(await git(f.root, [storeDir, "rev-list", "--count", ref]));
  const importStream = Array.from({ length: 2001 - initialCount }, (_entry, index) =>
    `commit ${ref}\ncommitter Test User <test@test.com> ${1700000000 + index} +0000\ndata 4\nEdit\n`
    + (index === 0 ? `from ${original}\n` : "") + "\n").join("");
  execFileSync("git", [storeDir, "fast-import", "--quiet"], { cwd: f.root, input: importStream });
  expect(await git(f.root, [storeDir, "rev-list", "--count", ref])).toBe("2001");
  expect(Number(await git(f.root, [storeDir, "rev-list", "--disk-usage", "--objects", ref]))).toBeLessThan(50_000_000);
  const before = stored(await f.store.version());

  const result = await f.run(replacement);
  expect(result).toMatchObject({ status: "written", stateAtHandoff: before, diagnostics: [],
    maintenance: { growth: [{ ref, commits: 2001, text: expect.stringContaining("2001 commits") }], contention: null } });
  if (result.status !== "written") throw new Error(JSON.stringify(result));
  expect(result.maintenance.growth[0]).not.toHaveProperty("diskBytes");
  expect(await f.read()).toMatchObject({ fields: { stateAtHandoff: before, commitAtHandoff: f.head } });
  await f.unchangedCheckout();
}, SESSION_COMMAND_TIMEOUT_MS);

it.skipIf(process.platform === "win32")("keeps a landed handoff when local Git maintenance fails and succeeds after repair", async () => {
  const f = await fixture();
  const bin = join(f.root, ".git", "maintenance-bin");
  await mkdir(bin);
  const wrapper = join(bin, "git");
  await writeFile(wrapper, `#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = maintenance ]; then
    echo 'fixture: local Git maintenance unavailable' >&2
    exit 17
  fi
done
PATH=${'$'}{PATH#*:}
export PATH
exec git "$@"
`);
  await chmod(wrapper, 0o755);
  const basis = stored(await f.store.version());

  expect(await f.run(replacement, { env: { PATH: bin + delimiter + process.env.PATH } })).toMatchObject({
    status: "written", reference: f.meta.reference, stateAtHandoff: basis, commitAtHandoff: f.head,
    maintenance: { growth: [], contention: null },
    diagnostics: [expect.stringContaining("fixture: local Git maintenance unavailable")],
  });
  expect(await f.read()).toMatchObject({ fields: { sessionContext: replacement.sessionContext, stateAtHandoff: basis } });
  await f.unchangedCheckout();

  const repairedBasis = stored(await f.store.version());
  expect(await f.run(replacement)).toMatchObject({ status: "written", stateAtHandoff: repairedBasis, diagnostics: [] });
  expect(await f.read()).toMatchObject({ fields: { stateAtHandoff: repairedBasis, commitAtHandoff: f.head } });
  await f.unchangedCheckout();
}, SESSION_COMMAND_TIMEOUT_MS);
