/** Resolution-only personal mutations require identity before any batch ref changes. */
import { expect, it } from "vitest";
import { createRefStore } from "../../src/lib/store/index.js";
import { readConfiguredIdentity } from "../../src/lib/git/identity.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { fixtureGit } from "../helpers/store/ref-fixture-git.js";
import { makeGitExec } from "../helpers/integration.js";
import { mutationOf, seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";

it.each(["default", "separate"] as const)("refuses the whole project batch resolving a personal conflict without identity in %s", async (layout) => {
  const f = await createRefFixture({}, layout), git = fixtureGit(f);
  const base = await seed(f, f.reference("personal/document"), "base\n");
  success(await f.store.write(update(f, base, "current\n")));
  const stale = success(await f.store.write(update(f, base, "incoming\n")));
  const [conflict] = stale.conflicts;
  if (!conflict) throw new Error("The stale personal write produced no conflict");
  const preserved = success(await f.store.read({ reference: conflict }));
  const inbox = await seed(f, f.reference("project-inbox/inbox"));
  const counter = await seed(f, f.reference("project-registry/counter"));
  const store = createRefStore({ ...f.ports, identity: () => readConfiguredIdentity(f.ports.exec, f.root) });
  const writes = [
    mutationOf(update(f, counter)),
    { ...mutationOf(update(f, inbox)), resolves: [conflict] },
  ];
  const refs = () => git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"]);
  const before = (await refs()).stdout;
  expect(await store.batch({ writes, provenance: testProvenance })).toMatchObject({ status: "refused", refusal: {
    code: "not-found", class: "recoverable", reference: conflict, condition: expect.stringContaining("arc.identity"),
    remedy: { text: expect.stringContaining("Configure arc.identity") },
  } });
  expect((await refs()).stdout).toBe(before);
  expect(success(await f.store.read({ reference: conflict })).content).toBe(preserved.content);
  expect(success(await f.store.read({ reference: inbox.reference })).content).toBe(inbox.content);
  expect(success(await f.store.read({ reference: counter.reference })).content).toBe(counter.content);
  await makeGitExec(f.root)("git", ["config", "arc.identity", "test-user"]);
  success(await store.batch({ writes, provenance: testProvenance }));
  expect(await store.read({ reference: conflict })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(success(await store.read({ reference: inbox.reference })).content).toBe(f.content(inbox.reference, "changed"));
  expect(success(await store.read({ reference: counter.reference })).content).toBe(f.content(counter.reference, "changed"));
});
