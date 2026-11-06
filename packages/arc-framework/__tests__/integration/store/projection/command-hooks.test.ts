/** Commander hooks write back before output and settle after normally returning actions. */
import { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";
import { registerProjectionHooks } from "../../../../src/lib/store/projection/command-hooks.js";
import { createEngineFixture, initializeEngineCheckout, overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { TASK_RULE_CONTENT } from "../../../helpers/store/task-rule-input.js";
import { createKindRegistry } from "../../../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../../../src/lib/store/kinds/registrations.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { access, mkdir, readFile, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TAKEN_IN_FOLDER } from "../../../../src/lib/store/projection/taken-in.js";
import { startProjection } from "../../../../src/lib/store/projection/engine.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { createMarkerFixture } from "../../../helpers/store/projection/marker-fixture.js";
import { formatConflictToken } from "../../../../src/lib/status/conflict-token.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

describe("projection command hooks", () => {
  it("reports a refused task tick and its remedy before whole JSON output, then accepts a repaired edit", async () => {
    const h = await createEngineFixture(directories, { kind: "work-item/task-list", path: ".arc/active/tasks-example.md",
      content: TASK_RULE_CONTENT, registryOverrides: { "work-item/task-list": createKindRegistry(PRODUCTION_REGISTRATIONS)["work-item/task-list"] } });
    await h.edit(TASK_RULE_CONTENT.replace("`[ ]`", "`[x]`") + "\nIndependent note.\n");
    const events: { stream: string; text: string }[] = [];
    const program = new Command("arc").exitOverride();
    program.command("probe").action(() => { events.push({ stream: "stdout", text: JSON.stringify({ ok: true }) }); });
    registerProjectionHooks(program, { input: () => ({ store: h.store, checkout: h.checkout }),
      writeError: text => { events.push({ stream: "stderr", text }); } });
    await program.parseAsync(["probe"], { from: "user" });
    const diagnostic = events.filter(event => event.stream === "stderr").map(event => event.text).join("");
    expect(diagnostic).toContain("task-list.close");
    expect(diagnostic).toContain(h.path);
    expect(diagnostic).toContain("arc release commit --close=1.1");
    expect(events[0]?.stream).toBe("stderr");
    expect(JSON.parse(events.find(event => event.stream === "stdout")?.text ?? "")).toEqual({ ok: true });
    expect((await h.stored()).content).toBe(TASK_RULE_CONTENT);
    expect(await h.file()).toContain("`[x]`");
    await h.edit(TASK_RULE_CONTENT + "\nIndependent note.\n");
    events.length = 0;
    await program.parseAsync(["probe"], { from: "user" });
    expect((await h.stored()).content).toContain("Independent note.");
    expect(events.filter(event => event.stream === "stderr").map(event => event.text).join("")).not.toContain("task-list.close");
  });

  it("reports repeated saves left pending before output and sends the latest bytes on the next command", async () => {
    const h = await createEngineFixture(directories);
    let saving = true;
    let revision = 1;
    await h.edit(`edit ${revision}\n`);
    const store = overrideEngineStore(h.store, { write: async input => {
      const result = await h.store.write(input);
      if (saving && result.status === "ok") await h.edit(`edit ${++revision}\n`);
      return result;
    } });
    const events: string[] = [];
    const program = new Command("arc").exitOverride();
    program.command("probe").action(() => { events.push("command output"); });
    registerProjectionHooks(program, { input: () => ({ store, checkout: h.checkout }),
      writeError: text => { events.push(text); } });
    await program.parseAsync(["probe"], { from: "user" });
    expect((await h.stored()).content).toBe("edit 4\n");
    expect(await h.file()).toContain("edit 5\n");
    expect((await h.disk()).entries[h.path]).toMatchObject({ pending: true });
    expect(projectionProcessState().roots.get(h.checkout)?.unsent.has(h.path)).toBe(true);
    const warning = events.slice(0, events.indexOf("command output")).join("");
    expect(warning).toContain(h.path);
    expect(warning).toContain("unsettled");
    expect(warning).toContain("next command");
    saving = false;
    events.length = 0;
    await program.parseAsync(["probe"], { from: "user" });
    expect((await h.stored()).content).toBe("edit 5\n");
    expect(projectionProcessState().roots.get(h.checkout)?.unsent.has(h.path)).toBe(false);
    expect(events).toEqual(["command output"]);
  });

  it("reports a save that wins read-back's swap and persists it on the next command", async () => {
    const h = await createEngineFixture(directories);
    await h.edit("accepted first save\n");
    let recreate = true;
    const native = h.ports();
    const events: string[] = [];
    const program = new Command("arc").exitOverride();
    program.command("probe").action(() => { events.push("command output"); });
    registerProjectionHooks(program, { input: () => ({ store: h.store, checkout: h.checkout,
      ports: () => ({ ...native, hooks: { afterMove: async path => {
        if (recreate && path === h.path) await h.edit("new save wins\n");
      } } }) }), writeError: text => { events.push(text); } });
    await program.parseAsync(["probe"], { from: "user" });
    expect((await h.stored()).content).toBe("accepted first save\n");
    expect(await h.file()).toBe(renderStampedFile({ content: "new save wins\n", stamp: h.entry.base.blob }));
    expect((await h.disk()).entries[h.path]).toMatchObject({ pending: true });
    expect(projectionProcessState().roots.get(h.checkout)?.unsent.has(h.path)).toBe(true);
    const warning = events.slice(0, events.indexOf("command output")).join("");
    expect(warning).toContain(h.path);
    expect(warning).toContain("pending");
    expect(warning).toContain("next command");
    recreate = false;
    events.length = 0;
    await program.parseAsync(["probe"], { from: "user" });
    expect((await h.stored()).content).toBe("new save wins\n");
    expect(projectionProcessState().roots.get(h.checkout)?.unsent.has(h.path)).toBe(false);
    expect(events).toEqual(["command output"]);
  });

  it("writes completed roots under save only for the root save command and records its start outcome", async () => {
    const h = await createEngineFixture(directories, { path: ".arc/completed/2026-q4/document.md" });
    await h.edit("saved archive edit\n");
    const program = new Command("arc").exitOverride();
    program.command("save").action(() => undefined);
    program.command("user").command("save").action(() => undefined);
    registerProjectionHooks(program, { input: () => ({ store: h.store, checkout: h.checkout }), writeError: () => undefined });
    await program.parseAsync(["user", "save"], { from: "user" });
    expect((await h.stored()).content).toBe(h.record.content);
    await program.parseAsync(["save"], { from: "user" });
    expect((await h.stored()).content).toBe("saved archive edit\n");
    expect(success(await h.store.history({ reference: h.record.reference }))[0]).toMatchObject({ provenance: { verb: "save" } });
    expect(projectionProcessState()).toMatchObject({ start: { kind: "ready" } });
  });

  it.each([false, true])("settles before development refresh even when the action sets an exit code (%s)", async setsExit => {
    const h = await createEngineFixture(directories);
    const orphan = join(h.location.stateDir, TAKEN_IN_FOLDER, "unreferenced-copy");
    const events: string[] = [];
    const program = new Command("arc").exitOverride();
    program.hook("preAction", () => { events.push("guard"); });
    program.hook("postAction", async () => {
      await expect(access(orphan)).rejects.toMatchObject({ code: "ENOENT" });
      events.push("refresh after settlement");
    });
    program.command("probe").action(async () => {
      expect(projectionProcessState()).toMatchObject({ start: { kind: "ready" } });
      await mkdir(join(h.location.stateDir, TAKEN_IN_FOLDER), { recursive: true });
      await writeFile(orphan, "unreferenced retained content");
      events.push("action");
      if (setsExit) process.exitCode = 7;
    });
    registerProjectionHooks(program, { input: () => ({ store: h.store, checkout: h.checkout }), writeError: () => undefined });
    const previous = process.exitCode;
    try {
      await program.parseAsync(["probe"], { from: "user" });
      expect(events).toEqual(["guard", "action", "refresh after settlement"]);
      if (setsExit) expect(process.exitCode).toBe(7);
    } finally { process.exitCode = previous; }
  });

  it("records a no-identity save start and continues to the action, then succeeds after identity repair", async () => {
    const h = await createEngineFixture(directories, { path: ".arc/active/document.md" });
    await h.edit("saved edit\n");
    await h.exec("git", ["config", "arc.identity", "BAD ID"], { cwd: h.checkout });
    const program = new Command("arc").exitOverride();
    const output: string[] = [];
    program.command("save").action(() => { output.push("action"); });
    registerProjectionHooks(program, { input: () => ({ store: h.store, checkout: h.checkout }), writeError: text => { output.push(text); } });
    await program.parseAsync(["save"], { from: "user" });
    expect(projectionProcessState()).toMatchObject({ start: { kind: "skipped", skip: { reason: "no-identity" } } });
    expect(output.at(-1)).toBe("action");
    expect(output.slice(0, -1).join("")).toContain("identity");
    expect(output.slice(0, -1).join("")).toContain(h.path);
    expect((await h.stored()).content).toBe(h.record.content);
    await h.exec("git", ["config", "arc.identity", "andrew"], { cwd: h.checkout });
    await program.parseAsync(["save"], { from: "user" });
    expect((await h.stored()).content).toBe("saved edit\n");
    expect(projectionProcessState()).toMatchObject({ start: { kind: "ready" } });
  });

  it("reports an aside save kept because its original path moved on before the command output", async () => {
    const h = await createEngineFixture(directories);
    const native = h.ports();
    await h.edit("first edit\n");
    await startProjection({ store: h.store, checkout: h.checkout, ports: () => ({ ...native,
      writer: async () => ({ ...await native.writer(), processInstance: "previous-command" }) }) });
    const entry = (await h.disk()).entries[h.path];
    if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("Missing displaced file");
    const copy = entry.copies[0].name;
    const late = renderStampedFile({ content: "late aside edit\n", stamp: h.entry.base.blob });
    await writeFile(join(h.checkout, copy), late);
    await h.edit("newer path edit\n");
    const events: string[] = [];
    const program = new Command("arc").exitOverride();
    program.command("probe").action(() => { events.push("command output"); });
    registerProjectionHooks(program, { input: () => ({ store: h.store, checkout: h.checkout, ports: () => ({ ...native,
      writer: async () => ({ ...await native.writer(), processInstance: "next-command" }) }) }),
      writeError: text => { events.push(text); } });
    await program.parseAsync(["probe"], { from: "user" });
    expect(events[0]).toContain("moved-on");
    expect(events[0]).toContain(copy);
    expect(events[0]).toContain(h.path);
    expect(events.indexOf("command output")).toBeGreaterThan(0);
    expect(await readFile(join(h.checkout, copy), "utf8")).toBe(late);
    expect((await h.stored()).content).toBe("newer path edit\n");
  });

  it("reports an open conflict a held file cannot show, then reports its accepted marker resolution", async () => {
    const base = "opening\nbase first\nseparation one\nseparation two\nbase tail\nclosing\n";
    const h = await createMarkerFixture({ path: ".arc/user/andrew/document.md", base,
      current: base.replace("base first", "stored first"), incoming: base.replace("base first", "incoming first") });
    directories.push(h.checkout);
    await initializeEngineCheckout(h.checkout);
    success(await h.store.write({ action: "put", reference: h.entry.reference, expected: h.record.version,
      content: h.record.content.replace("base tail", "stored tail"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const extra = success(await h.store.write({ action: "put", reference: h.entry.reference, expected: h.record.version,
      content: h.record.content.replace("base tail", "incoming tail"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const second = extra.conflicts[0];
    const first = h.conflicts[0]?.reference;
    if (second === undefined || first === undefined) throw new Error("Missing stored conflict");
    await h.edit(h.content.replace("stored first", "resolution in progress"));
    const events: string[] = [];
    const program = new Command("arc").exitOverride();
    program.command("probe").action(() => { events.push("command output"); });
    registerProjectionHooks(program, { input: () => ({ store: h.store, checkout: h.checkout }), writeError: text => { events.push(text); } });
    await program.parseAsync(["probe"], { from: "user" });
    const held = events.slice(0, events.indexOf("command output")).join("");
    expect(held).toContain("unshown-conflict");
    expect(held).toContain(formatConflictToken(second));
    expect(held).toContain("resolution");
    const current = success(await h.store.read({ reference: h.entry.reference }));
    await h.edit(current.content.replace("stored first", "resolved first"));
    events.length = 0;
    await program.parseAsync(["probe"], { from: "user" });
    expect(events.join("")).toContain(`resolved ${formatConflictToken(first)}`);
    expect(success(await h.store.read({ reference: h.entry.reference })).conflicts).not.toContainEqual(first);
  });

  it("reports a young empty save as pending before output and accepts it once the editor finishes", async () => {
    const h = await createEngineFixture(directories);
    await writeFile(join(h.checkout, h.path), "");
    const future = new Date(Date.now() + 60_000);
    await utimes(join(h.checkout, h.path), future, future);
    const output: string[] = [];
    const program = new Command("arc").exitOverride();
    program.command("probe").action(() => { output.push("command output"); });
    registerProjectionHooks(program, { input: () => ({ store: h.store, checkout: h.checkout }), writeError: text => { output.push(text); } });
    await program.parseAsync(["probe"], { from: "user" });
    expect(output[0]).toContain("pending: empty");
    expect(output[0]).toContain(h.path);
    expect(output.indexOf("command output")).toBeGreaterThan(0);
    expect((await h.stored()).content).toBe(h.record.content);
    expect(await h.file()).toBe("");
    await h.edit("finished save\n");
    await program.parseAsync(["probe"], { from: "user" });
    expect((await h.stored()).content).toBe("finished save\n");
  });

  it("includes a backend remedy's quoted argv and accepts the edit after repair", async () => {
    const h = await createEngineFixture(directories);
    await h.edit("hand edit\n");
    let blocked = true;
    const store = overrideEngineStore(h.store, { write: input => blocked ? Promise.resolve({ status: "refused",
      refusal: { code: "lock-held", class: "recoverable", lock: "personal", condition: "A backend writer holds the lock.",
        remedy: { text: "Repair the held lock, then retry.", argv: ["repair-store", "local data"] } } }) : h.store.write(input) });
    const output: string[] = [];
    const program = new Command("arc").exitOverride();
    program.command("probe").action(() => undefined);
    registerProjectionHooks(program, { input: () => ({ store, checkout: h.checkout }), writeError: text => { output.push(text); } });
    await program.parseAsync(["probe"], { from: "user" });
    expect(output.join("")).toContain("Repair the held lock, then retry.");
    expect(output.join("")).toContain("repair-store 'local data'");
    expect((await h.stored()).content).toBe(h.record.content);
    blocked = false;
    await program.parseAsync(["probe"], { from: "user" });
    expect((await h.stored()).content).toBe("hand edit\n");
  });

  it("reports a late moved-on copy discovered during the command-end check", async () => {
    const h = await createEngineFixture(directories);
    await h.edit("first edit\n");
    let copy = "";
    const output: string[] = [];
    const program = new Command("arc").exitOverride();
    program.command("probe").action(async () => {
      const entry = (await h.disk()).entries[h.path];
      if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("Missing displaced file");
      copy = entry.copies[0].name;
      await writeFile(join(h.checkout, copy), renderStampedFile({ content: "late aside edit\n", stamp: h.entry.base.blob }));
      await h.edit("newer path edit\n");
      output.push("command output");
    });
    registerProjectionHooks(program, { input: () => ({ store: h.store, checkout: h.checkout }), writeError: text => { output.push(text); } });
    await program.parseAsync(["probe"], { from: "user" });
    expect(output[0]).toBe("command output");
    expect(output.slice(1).join("")).toContain("moved-on");
    expect(output.slice(1).join("")).toContain(copy);
    expect(await readFile(join(h.checkout, copy), "utf8")).toContain("late aside edit");
    expect(await h.file()).toContain("newer path edit");
  });
});
