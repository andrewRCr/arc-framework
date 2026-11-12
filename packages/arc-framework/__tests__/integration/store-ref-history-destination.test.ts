/** Live-to-history writes admit captured ancestry and absorb bounded outside-writer races. */
import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, RecordReferenceSchema, type StoreRecord } from "../../src/lib/store/index.js";
import { createRefFixture, type RefConformanceFixture } from "../helpers/store/ref-fixture.js";
import { mutationOf, seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";

function liveRef(record: StoreRecord): string {
  if (!("uid" in record.reference.owner) || !record.reference.owner.uid) throw new Error("Expected stored owner UID");
  return `refs/arc/work/${record.reference.owner.uid}`;
}

it.each((["archive", "retire"] as const).flatMap(ending => (["stray", "ancestor"] as const).map(history => ({ ending, history }))))(
  "checks a $history history destination before $ending and succeeds after repair", async ({ ending, history }) => {
    const f = await createRefFixture();
    const original = await seed(f, f.reference("work-item/meta"));
    const live = liveRef(original), target = live.replace("refs/arc/", "refs/arc/history/");
    const ancestor = (await f.ports.exec("git", ["rev-parse", live])).stdout.trim();
    success(await f.store.write(update(f, original)));
    const current = success(await f.store.read({ reference: original.reference }));
    const other = await seed(f, f.reference("work-item/meta", "other"));
    const stray = (await f.ports.exec("git", ["rev-parse", liveRef(other)])).stdout.trim();
    await f.ports.exec("git", ["update-ref", target, history === "ancestor" ? ancestor : stray]);
    const before = (await f.ports.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
    let attempts = 0;
    const store = createRefStore({ ...f.ports, execInput: async (args, input, options) => {
      if (args.includes("update-ref") && input.includes(target) && ++attempts > 1) throw new Error("Repeated a locked history CAS");
      return f.ports.execInput(args, input, options);
    } });
    const lineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: current.reference.owner });
    const run = () => ending === "archive" ? store.write({ ...update(f, current, current.content),
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } })
      : store.batch({ writes: [{ action: "put", reference: lineage, expected: null, content: f.content(lineage) },
        { action: "remove", reference: current.reference, expected: current.version }], provenance: testProvenance });
    if (history === "stray") {
      expect(await run()).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", namespace: target } });
      expect((await f.ports.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
      await f.ports.exec("git", ["update-ref", "-d", target]);
    }
    attempts = 0;
    expect(await run()).toMatchObject({ status: "ok" });
    const retained = (await f.ports.exec("git", ["rev-parse", target])).stdout.trim();
    expect(retained).not.toBe(history === "ancestor" ? ancestor : stray);
    expect((await f.ports.exec("git", ["for-each-ref", "--format=%(refname)", live])).stdout).toBe("");
  });

it("absorbs one ancestor destination move outside its held lock", async () => {
  const f = await createRefFixture();
  const record = await seed(f, f.reference("work-item/meta"));
  const live = liveRef(record), history = live.replace("refs/arc/", "refs/arc/history/");
  const racedTip = (await f.ports.exec("git", ["rev-parse", live])).stdout.trim();
  let raced = false, attempts = 0;
  const store = createRefStore({ ...f.ports, execInput: async (args, input, options) => {
    if (args.includes("update-ref") && input.includes(history)) {
      if (++attempts > 3) throw new Error("The ancestor race did not settle");
      if (!raced) { raced = true; await f.ports.exec("git", ["update-ref", history, racedTip]); }
    }
    return f.ports.execInput(args, input, options);
  } });
  const mutation = { ...update(f, record, record.content), placement: { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") } };
  expect(await store.write(mutation)).toMatchObject({ status: "ok" });
  expect(attempts).toBe(2);
  expect((await f.ports.exec("git", ["for-each-ref", "--format=%(refname)", live])).stdout).toBe("");
  expect((await f.ports.exec("git", ["merge-base", "--is-ancestor", racedTip, history])).stdout).toBe("");
  expect(success(await f.store.read({ reference: record.reference })).placement?.kind).toBe("completed");
});

async function historyRaceFixture(fixture?: RefConformanceFixture, suffix = "one") {
  const f = fixture ?? await createRefFixture();
  let record = await seed(f, f.reference("work-item/meta", suffix));
  const live = liveRef(record), history = live.replace("refs/arc/", "refs/arc/history/");
  const ancestors: string[] = [];
  for (let index = 0; index < 6; index += 1) {
    ancestors.push((await f.ports.exec("git", ["rev-parse", live])).stdout.trim());
    success(await f.store.write(update(f, record, JSON.stringify({ ancestor: index }))));
    record = success(await f.store.read({ reference: record.reference }));
  }
  await f.ports.exec("git", ["update-ref", history, ancestors[0]!]);
  const mutation = { ...update(f, record, record.content), placement: { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") } };
  return { f, record, live, history, ancestors, mutation };
}

it("refuses the third consecutive history transaction loss and succeeds after repair", async () => {
  const h = await historyRaceFixture(), { f, history } = h;
  let attempts = 0, racing = true;
  const store = createRefStore({ ...f.ports, execInput: async (args, input, options) => {
    if (args.includes("update-ref") && input.includes(history)) {
      attempts += 1;
      const next = h.ancestors[attempts];
      if (racing && next) await f.ports.exec("git", ["update-ref", history, next]);
    }
    return f.ports.execInput(args, input, options);
  } });
  expect(await store.write(h.mutation)).toMatchObject({ status: "refused", refusal: {
    code: "namespace-corrupt", class: "terminal", namespace: history,
    condition: expect.stringContaining(history), remedy: { text: expect.stringMatching(/repair.*ancestor/iu) },
  } });
  expect(attempts).toBe(3);
  expect((await f.ports.exec("git", ["rev-parse", history])).stdout.trim()).toBe(h.ancestors[3]);
  expect(success(await f.store.read({ reference: h.record.reference }))).toEqual(h.record);
  racing = false;
  await f.ports.exec("git", ["update-ref", "-d", history]);
  success(await store.write(h.mutation));
  expect(success(await f.store.read({ reference: h.record.reference })).placement?.kind).toBe("completed");
});

it("refuses the third history admission loss and succeeds after repair", async () => {
  const h = await historyRaceFixture(), { f, history } = h;
  let admissions = 0, racing = true;
  const store = createRefStore({ ...f.ports, lock: async (name, waitMs) => {
    const release = await f.ports.lock(name, waitMs);
    if (name === "layout") {
      admissions += 1;
      const next = h.ancestors[admissions];
      if (racing && next) await f.ports.exec("git", ["update-ref", history, next]);
    }
    return release;
  } });
  expect(await store.write(h.mutation)).toMatchObject({ status: "refused", refusal: {
    code: "namespace-corrupt", namespace: history, remedy: { text: expect.stringMatching(/repair.*ancestor/iu) },
  } });
  expect(admissions).toBe(3);
  expect(success(await f.store.read({ reference: h.record.reference }))).toEqual(h.record);
  racing = false;
  await f.ports.exec("git", ["update-ref", "-d", history]);
  success(await store.write(h.mutation));
  expect(success(await f.store.read({ reference: h.record.reference })).placement?.kind).toBe("completed");
});

it("bounds destination appearance and disappearance during owner re-resolution", async () => {
  const h = await historyRaceFixture(), { f, history } = h;
  let acquisitions = 0, racing = true;
  const store = createRefStore({ ...f.ports, lock: async (name, waitMs) => {
    const release = await f.ports.lock(name, waitMs);
    if (name === h.live && ++acquisitions <= 3 && racing) {
      await f.ports.exec("git", acquisitions % 2 === 1 ? ["update-ref", "-d", history]
        : ["update-ref", history, h.ancestors[1]!]);
    }
    return release;
  } });
  expect(await store.write(h.mutation)).toMatchObject({ status: "refused", refusal: {
    code: "namespace-corrupt", namespace: history, remedy: { text: expect.stringMatching(/repair.*ancestor/iu) },
  } });
  expect(acquisitions).toBe(3);
  expect(success(await f.store.read({ reference: h.record.reference }))).toEqual(h.record);
  racing = false;
  await f.ports.exec("git", ["update-ref", "-d", history]);
  success(await store.write(h.mutation));
  expect(success(await f.store.read({ reference: h.record.reference })).placement?.kind).toBe("completed");
});

it.each(["admission", "transaction"] as const)("counts a first %s creation once across later destination re-detections", async first => {
  const h = await historyRaceFixture(), { f, history } = h;
  await f.ports.exec("git", ["update-ref", "-d", history]);
  let losses = 0, publications = 0, racing = true;
  const move = async () => {
    await f.ports.exec("git", losses % 2 === 0 ? ["update-ref", history, h.ancestors[Math.floor(losses / 2)]!]
      : ["update-ref", "-d", history]);
    losses += 1;
  };
  const store = createRefStore({ ...f.ports, lock: async (name, waitMs) => {
    const release = await f.ports.lock(name, waitMs);
    if (racing && first === "admission" && name === "layout" && losses === 0) await move();
    return release;
  }, execInput: async (args, input, options) => {
    if (args.includes("update-ref") && input.includes(history)) {
      publications += 1;
      if (racing && losses < 3) await move();
    }
    return f.ports.execInput(args, input, options);
  } });
  expect(await store.write(h.mutation)).toMatchObject({ status: "refused", refusal: {
    code: "namespace-corrupt", namespace: history, remedy: { text: expect.stringMatching(/repair.*ancestor/iu) },
  } });
  expect(losses).toBe(3);
  expect(publications).toBe(first === "admission" ? 2 : 3);
  expect(success(await f.store.read({ reference: h.record.reference }))).toEqual(h.record);
  racing = false;
  await f.ports.exec("git", ["update-ref", "-d", history]);
  success(await store.write(h.mutation));
  expect(success(await f.store.read({ reference: h.record.reference })).placement?.kind).toBe("completed");
});

it("resets history losses when an ordinary transaction race intervenes", async () => {
  const h = await historyRaceFixture(), { f, history } = h;
  await seed(f, f.reference("project-registry/identity"));
  const registry = "refs/arc/project/registry";
  const before = (await f.ports.exec("git", ["rev-parse", registry])).stdout.trim();
  await seed(f, RecordReferenceSchema.parse({ owner: h.record.reference.owner, kind: "lineage/transition" }));
  const after = (await f.ports.exec("git", ["rev-parse", registry])).stdout.trim();
  // Both registry states were produced by Store; the outside writer races their native CAS.
  await f.ports.exec("git", ["update-ref", registry, before, after]);
  let attempts = 0;
  const store = createRefStore({ ...f.ports, execInput: async (args, input, options) => {
    if (args.includes("update-ref") && input.includes(history)) {
      attempts += 1;
      if (attempts === 3) await f.ports.exec("git", ["update-ref", registry, after, before]);
      else if (attempts <= 5) await f.ports.exec("git", ["update-ref", history, h.ancestors[attempts < 3 ? attempts : attempts - 1]!]);
    }
    return f.ports.execInput(args, input, options);
  } });
  success(await store.write(h.mutation));
  expect(attempts).toBe(6);
  expect(success(await f.store.read({ reference: h.record.reference })).placement?.kind).toBe("completed");
  expect((await f.ports.exec("git", ["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe("");
});

it("does not count history moves when the batch writes no history destination", async () => {
  const h = await historyRaceFixture(), { f, history } = h;
  let admissions = 0;
  const store = createRefStore({ ...f.ports, lock: async (name, waitMs) => {
    const release = await f.ports.lock(name, waitMs);
    if (name === "layout") {
      admissions += 1;
      const next = h.ancestors[admissions];
      if (admissions <= 3) await f.ports.exec("git", ["update-ref", history, next!]);
    }
    return release;
  } });
  const content = JSON.stringify({ settled: "current" });
  success(await store.write(update(f, h.record, content)));
  expect(admissions).toBe(4);
  expect(success(await f.store.read({ reference: h.record.reference }))).toMatchObject({ content, placement: { kind: "active" } });
  expect((await f.ports.exec("git", ["rev-parse", history])).stdout.trim()).toBe(h.ancestors[3]);
  expect((await f.ports.exec("git", ["for-each-ref", "--format=%(refname)", h.live])).stdout.trim()).toBe(h.live);
});

it("counts simultaneous destination losses as one attempt for an atomic batch", async () => {
  const left = await historyRaceFixture(), { f } = left;
  const right = await historyRaceFixture(f, "two");
  let attempts = 0;
  const store = createRefStore({ ...f.ports, execInput: async (args, input, options) => {
    if (args.includes("update-ref") && input.includes(left.history) && input.includes(right.history)) {
      attempts += 1;
      if (attempts <= 2) await f.ports.execInput(["update-ref", "--stdin"], ["start",
        ...[left, right].map(h => `update ${h.history} ${h.ancestors[attempts]}`), "prepare", "commit", ""].join("\n"));
    }
    return f.ports.execInput(args, input, options);
  } });
  success(await store.batch({ writes: [left.mutation, right.mutation].map(mutationOf), provenance: testProvenance }));
  expect(attempts).toBe(3);
  for (const h of [left, right]) {
    expect(success(await f.store.read({ reference: h.record.reference })).placement?.kind).toBe("completed");
    expect((await f.ports.exec("git", ["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe("");
    expect((await f.ports.exec("git", ["merge-base", "--is-ancestor", h.ancestors[2]!, h.history])).stdout).toBe("");
  }
});

async function comparisonFreeHistoryRace(onCapture: "advance" | "keep") {
  const h = await historyRaceFixture(), { f, history } = h;
  const primary = await seed(f, f.reference("work-item/meta", "other"));
  const companion = await seed(f, f.reference("work-item/companion", "other"), "retained notes\n");
  const companionLive = liveRef(primary);
  const before = (await f.ports.exec("git", ["rev-parse", companionLive])).stdout.trim();
  const reference = RecordReferenceSchema.parse({ ...primary.reference, owner: { ...primary.reference.owner, name: "renamed-other" } });
  success(await f.store.write({ ...update(f, primary, primary.content), reference }));
  const renamed = (await f.ports.exec("git", ["rev-parse", companionLive])).stdout.trim();
  expect(success(await f.store.read({ reference: companion.reference })).version).toBe(companion.version);
  await f.ports.exec("git", ["update-ref", companionLive, before, renamed]);
  const events = { publications: 0, losses: 0, renames: 0, captures: 0, held: false, released: false, racing: true };
  const store = createRefStore({ ...f.ports, lock: async (name, waitMs) => {
    const release = await f.ports.lock(name, waitMs);
    if (name !== companionLive) return release;
    events.held = true;
    return async () => {
      await release();
      events.held = false;
      if (events.renames > 0) events.released = true;
    };
  }, rawExec: async (args, options) => {
    if (events.racing && args.includes("for-each-ref") && args.includes("--format=%(objectname) %(refname)")) {
      if (events.publications === 2 && events.renames === 0 && events.held) {
        await f.ports.exec("git", ["update-ref", companionLive, renamed, before]);
        events.renames += 1;
      } else if (events.released && !events.held && events.captures === 0) {
        if (onCapture === "advance") await f.ports.exec("git", ["update-ref", history, h.ancestors[3]!, h.ancestors[2]!]);
        events.captures += 1;
      }
    }
    return f.ports.rawExec(args, options);
  }, execInput: async (args, input, options) => {
    if (args.includes("update-ref") && input.includes(history)) {
      events.publications += 1;
      if (events.racing && events.publications <= (onCapture === "advance" ? 2 : 4)) {
        await f.ports.exec("git", ["update-ref", history, h.ancestors[events.publications]!]);
        events.losses += 1;
      }
    }
    return f.ports.execInput(args, input, options);
  } });
  const run = () => store.batch({ writes: [h.mutation, update(f, companion, companion.content)].map(mutationOf), provenance: testProvenance });
  return { ...h, companion, events, run };
}

it("counts a new destination value captured after a comparison-free owner restart", async () => {
  const h = await comparisonFreeHistoryRace("advance"), { f, events, history } = h;
  const result = await h.run();
  expect(events).toMatchObject({ renames: 1, captures: 1, losses: 2 });
  expect(result).toMatchObject({ status: "refused", refusal: {
    code: "namespace-corrupt", namespace: history, remedy: { text: expect.stringMatching(/repair.*ancestor/iu) },
  } });
  expect(events.publications).toBe(2);
  expect(success(await f.store.read({ reference: h.record.reference }))).toEqual(h.record);
  events.racing = false;
  await f.ports.exec("git", ["update-ref", "-d", history]);
  success(await h.run());
  expect(success(await f.store.read({ reference: h.record.reference })).placement?.kind).toBe("completed");
  expect(success(await f.store.read({ reference: h.companion.reference }))).toMatchObject({
    content: h.companion.content, version: h.companion.version, reference: { owner: { name: "renamed-other" } },
  });
});

it("resets the streak when a comparison-free owner restart captures no new history move", async () => {
  const h = await comparisonFreeHistoryRace("keep"), { f, events } = h;
  success(await h.run());
  expect(events).toMatchObject({ renames: 1, captures: 1, losses: 4, publications: 5 });
  expect(success(await f.store.read({ reference: h.record.reference })).placement?.kind).toBe("completed");
  expect(success(await f.store.read({ reference: h.companion.reference }))).toMatchObject({
    content: h.companion.content, version: h.companion.version, reference: { owner: { name: "renamed-other" } },
  });
});

it("counts a destination read and transaction loss within one attempt only once", async () => {
  const h = await historyRaceFixture(), { f, history } = h;
  let publications = 0, readMove = false;
  const store = createRefStore({ ...f.ports, rawExec: async (args, options) => {
    if (publications === 1 && !readMove && args.includes("for-each-ref") && args.includes("--format=%(objectname) %(refname)")) {
      await f.ports.exec("git", ["update-ref", history, h.ancestors[2]!, h.ancestors[1]!]);
      readMove = true;
    }
    return f.ports.rawExec(args, options);
  }, execInput: async (args, input, options) => {
    if (args.includes("update-ref") && input.includes(history)) {
      publications += 1;
      if (publications <= 2) await f.ports.exec("git", ["update-ref", history, h.ancestors[publications === 1 ? 1 : 3]!]);
    }
    return f.ports.execInput(args, input, options);
  } });
  success(await store.write(h.mutation));
  expect(readMove).toBe(true);
  expect(publications).toBe(3);
  expect(success(await f.store.read({ reference: h.record.reference })).placement?.kind).toBe("completed");
  expect((await f.ports.exec("git", ["merge-base", "--is-ancestor", h.ancestors[3]!, history])).stdout).toBe("");
});


it("names unavailable retained history and succeeds after restoring the original commit object", async () => {
  const f = await createRefFixture();
  const first = await seed(f, f.reference("work-item/meta"));
  const live = liveRef(first), history = live.replace("refs/arc/", "refs/arc/history/");
  const ancestor = (await f.ports.exec("git", ["rev-parse", live])).stdout.trim();
  const object = (await f.ports.rawExec(["cat-file", "commit", ancestor], { objectAccess: "local-only" })).stdout;
  success(await f.store.write(update(f, first)));
  const current = success(await f.store.read({ reference: first.reference }));
  await f.ports.exec("git", ["update-ref", history, ancestor]);
  await removeLooseObject(f.root, ancestor, f.gitDir);
  const mutation = { ...update(f, current, current.content), placement: { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") } };
  expect(await f.store.write(mutation)).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable", class: "recoverable", historyRefs: [],
    condition: expect.stringContaining(history),
    remedy: { text: expect.stringMatching(/restore|fetch/iu) } } });
  expect(success(await f.store.read({ reference: current.reference }))).toEqual(current);
  const restored = await f.ports.execInput(["hash-object", "-t", "commit", "-w", "--stdin"], new TextDecoder().decode(object));
  expect(restored.trim()).toBe(ancestor);
  expect(await f.store.write(mutation)).toMatchObject({ status: "ok" });
});

it("keeps an unrelated completed ancestry failure terminal and retries after the executor recovers", async () => {
  const f = await createRefFixture();
  const first = await seed(f, f.reference("work-item/meta"));
  const live = liveRef(first), history = live.replace("refs/arc/", "refs/arc/history/");
  const ancestor = (await f.ports.exec("git", ["rev-parse", live])).stdout.trim();
  success(await f.store.write(update(f, first)));
  const current = success(await f.store.read({ reference: first.reference }));
  const tip = (await f.ports.exec("git", ["rev-parse", live])).stdout.trim();
  await f.ports.exec("git", ["update-ref", history, ancestor]);
  const before = await f.settle();
  let blocked = true;
  const store = createRefStore({ ...f.ports, exec: async (command, args, options) => {
    if (blocked && args.includes("merge-base") && args.includes("--is-ancestor") && args.includes(ancestor) && args.includes(tip)) {
      throw makeGitProcessError({ command, args, exitCode: 128, stderr: "fatal: permission check failed" });
    }
    return f.ports.exec(command, args, options);
  } });
  const mutation = { ...update(f, current, current.content), placement: { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") } };
  expect(await store.write(mutation)).toMatchObject({ status: "refused", refusal: {
    code: "namespace-corrupt", class: "terminal", namespace: history, condition: expect.stringContaining("permission check failed"),
    remedy: { text: `Restore or fetch the missing objects for ${history} in the store repository, then retry.` },
  } });
  expect(await f.settle()).toBe(before);
  blocked = false;
  success(await store.write(mutation));
  expect(success(await f.store.read({ reference: current.reference })).placement?.kind).toBe("completed");
});
