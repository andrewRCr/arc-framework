/** Native Git common directories and command lifetime delimit the default store notification binding. */
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createEngineFixture, overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { beginProjectionCommand } from "../../../../src/lib/store/projection/process-state.js";
import { bindProjectionFanOut, createProjectionFanOutDependencies, disposeProjectionFanOut } from "../../../../src/lib/store/projection/fan-out-binding.js";
import { withFanOut } from "../../../../src/lib/store/projection/with-fan-out.js";
import type { Store } from "../../../../src/lib/store/contract.js";

const directories: string[] = [];
beforeEach(() => { beginProjectionCommand(); });
afterEach(async () => { disposeProjectionFanOut(); beginProjectionCommand(); await removeGitBackedDirs(directories.splice(0)); });

it("accepts multiple store objects and linked checkouts of its clone, excludes another repository, and closes at end", async () => {
  const h = await createEngineFixture(directories), other = await createEngineFixture(directories), destination = createReferenceFixture();
  destination.identity("andrew");
  await h.exec("git", ["commit", "--allow-empty", "-m", "Seed code"], { cwd: h.checkout });
  const sibling = join(h.checkout, "linked");
  await h.exec("git", ["worktree", "add", "--detach", sibling], { cwd: h.checkout });
  const writer = withFanOut(h.store, createProjectionFanOutDependencies(h.checkout));
  const second = withFanOut(h.reopen(), createProjectionFanOutDependencies(h.checkout));
  const linked = withFanOut(h.reopen(), createProjectionFanOutDependencies(sibling));
  const foreign = withFanOut(other.store, createProjectionFanOutDependencies(other.checkout));
  await bindProjectionFanOut({ checkout: h.checkout, location: h.location, ports: h.ports(), run: async () => {
    const current = await h.stored(), previous = await destination.store.read({ reference: current.reference });
    success(await destination.store.write({ action: "put", reference: current.reference,
      content: (previous.status === "ok" ? previous.result.content : "") + current.content,
      expected: previous.status === "ok" ? previous.result.version : null, provenance: { verb: "save", lifecycleAction: "save" } }));
  } });
  const put = async (store: Store, content: string) => {
    const current = await h.stored();
    success(await store.write({ action: "put", reference: current.reference, content, expected: current.version,
      provenance: { verb: "save", lifecycleAction: "save" } }));
  };
  await put(writer, "First handle.\n");
  await put(second, "Second handle.\n");
  await put(linked, "Linked handle.\n");
  const expected = "First handle.\nSecond handle.\nLinked handle.\n";
  expect(success(await destination.store.read({ reference: h.record.reference })).content).toBe(expected);
  success(await foreign.write({ action: "put", reference: other.record.reference, content: "Unrelated repository.\n", expected: other.record.version,
    provenance: { verb: "save", lifecycleAction: "save" } }));
  expect(success(await destination.store.read({ reference: h.record.reference })).content).toBe(expected);
  disposeProjectionFanOut();
  await put(writer, "Written after command end.\n");
  expect(success(await destination.store.read({ reference: h.record.reference })).content).toBe(expected);
});

it("does not deliver an operation started under an earlier binding into the next command", async () => {
  const h = await createEngineFixture(directories), earlier = createReferenceFixture(), later = createReferenceFixture();
  earlier.identity("andrew"); later.identity("andrew");
  let blocked = false;
  let release = (): void => { throw new Error("The operation gate was not initialized"); };
  const gate = new Promise<void>(resolve => { release = resolve; });
  const observed = overrideEngineStore(h.store, { write: async input => { if (blocked) await gate; return h.store.write(input); } });
  const store = withFanOut(observed, createProjectionFanOutDependencies(h.checkout));
  const bind = (destination: Store) => bindProjectionFanOut({ checkout: h.checkout, location: h.location, ports: h.ports(), run: async () => {
    const current = await h.stored(), previous = await destination.read({ reference: current.reference });
    success(await destination.write({ action: "put", reference: current.reference, content: current.content,
      expected: previous.status === "ok" ? previous.result.version : null, provenance: { verb: "save", lifecycleAction: "save" } }));
  } });
  await bind(earlier.store);
  success(await store.write({ action: "put", reference: h.record.reference, content: "Earlier command.\n", expected: h.record.version,
    provenance: { verb: "save", lifecycleAction: "save" } }));
  const first = await h.stored();
  blocked = true;
  const pending = store.write({ action: "put", reference: first.reference, content: "A late completion.\n", expected: first.version,
    provenance: { verb: "save", lifecycleAction: "save" } });
  beginProjectionCommand();
  await bind(later.store);
  release();
  success(await pending);
  expect(success(await earlier.store.read({ reference: h.record.reference })).content).toBe("Earlier command.\n");
  expect(await later.store.read({ reference: h.record.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
});
