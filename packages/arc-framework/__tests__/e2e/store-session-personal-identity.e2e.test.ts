/** Personal setup selects the named identity's real state before any seeds or configuration changes. */
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";

import { cleanupTempDir, git, runArcNoTty } from "./helpers.js";
import { addBareRemote } from "../helpers/integration.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { codeRefs, expectExit, fixtureStore, personalRecords, scratchRepo, SESSION_COMMAND_TIMEOUT_MS,
  sessionIdentity, sessionRepo, stored } from "../helpers/store-session-personal-fixture.js";
import { refuseIdentityAtTerminal } from "../helpers/store-session-personal-terminal.js";

type Verb = "add" | "init" | "join";
const verbs = ["add", "init", "join"] as const;
const chosen = SlugSchema.parse("selected-person");
const fresh = SlugSchema.parse("different-person");
const personal = personalRecords(chosen);
const capture = "# Inbox\n\n## Work Unit\n\n### **Keep the selected capture**\n\n- _Id:_ `12345678`\n";

function argv(verb: Verb, identity: string): string[] {
  if (verb === "add") return ["user", "add", identity];
  if (verb === "join") return ["join", "--contributor", "--tools", "", "--identity", identity];
  return ["init", "--name", "selected-project", "--tools", "", "--pm-mode", "none", "--identity", identity];
}

async function seedCapture(root: string) {
  const store = fixtureStore(root, chosen);
  stored(await store.write({ action: "put", reference: personal.inbox, expected: null, content: capture,
    provenance: { verb: "fixture", lifecycleAction: "seed" } }));
  return { store, inbox: stored(await store.read({ reference: personal.inbox })) };
}

async function readAbsent(root: string, identity: typeof chosen) {
  const store = fixtureStore(root, identity);
  for (const reference of Object.values(personalRecords(identity))) {
    expect(await store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }
}

it.each(verbs)("%s warns on reuse and seeds only the missing record for the selected identity", async verb => {
  const root = await (verb === "init" ? scratchRepo() : sessionRepo());
  const { store, inbox } = await seedCapture(root);
  const configured = fixtureStore(root);
  const configuredBefore = await configured.read({ reference: personalRecords(sessionIdentity).inbox });
  const refs = await codeRefs(root);

  const args = ["--no-input", ...argv(verb, chosen)];
  const result = await runArcNoTty(args, root);
  expectExit(args, result);
  expect(result.stdout + result.stderr).toContain(`Identity '${chosen}' already has personal records`);
  expect(stored(await store.read({ reference: personal.inbox }))).toEqual(inbox);
  expect(stored(await store.history({ reference: personal.inbox }))).toHaveLength(1);
  expect(stored(await store.read({ reference: personal.memory })).content).toContain("Working Memory");
  expect(await configured.read({ reference: personalRecords(sessionIdentity).inbox })).toEqual(configuredBefore);
  expect(await git(root, ["config", "--get", "arc.identity"])).toBe(verb === "add" ? sessionIdentity : chosen);
  expect(await codeRefs(root)).toBe(refs);
}, SESSION_COMMAND_TIMEOUT_MS);

it.each([
  { verb: "init", offlineFirst: false },
  { verb: "join", offlineFirst: false },
  { verb: "join", offlineFirst: true },
] as const)("$verb pulls the selected person's capture before setup (offline first: $offlineFirst)", async ({ verb, offlineFirst }) => {
  const publisher = await (verb === "init" ? scratchRepo() : sessionRepo());
  const origin = await addBareRemote(publisher);
  const designation = ["store", "remote", "origin", "push", "--json"];
  expectExit(designation, await runArcNoTty(designation, publisher));
  const published = await seedCapture(publisher);
  const pushed = stored(await published.store.push());
  expect(pushed.publishes, JSON.stringify(pushed)).toContainEqual(expect.objectContaining({ status: "pushed" }));

  const root = await scratchRepo();
  const clone = join(root, "clone");
  await git(root, ["clone", origin, clone]);
  onTestFinished(() => cleanupTempDir(clone));
  await git(clone, ["config", "user.name", "Joining User"]);
  await git(clone, ["config", "user.email", "joining@example.test"]);
  await git(clone, ["config", "remote.origin.arc-state", "push"]);
  await expect(git(clone, ["config", "--local", "--get", "arc.identity"])).rejects.toThrow();
  await readAbsent(clone, chosen);
  const head = await git(clone, ["rev-parse", "HEAD"]);

  const args = ["--no-input", ...argv(verb, chosen)];
  const reader = fixtureStore(clone, chosen);
  if (offlineFirst) {
    await git(clone, ["remote", "set-url", "origin", join(root, "unreachable.git")]);
    const blocked = await runArcNoTty(args, clone);
    const output = blocked.stdout + blocked.stderr;
    expect.soft(blocked.exitCode, output).not.toBe(0);
    expect(output).toContain("unreachable.git");
    expect(output).toContain("arc join");
    expect.soft(await git(clone, ["config", "--local", "--default", "", "--get", "arc.identity"])).toBe("");
    for (const reference of Object.values(personal)) {
      expect.soft(await reader.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    }
    await git(clone, ["remote", "set-url", "origin", origin]);
  }
  const result = await runArcNoTty(args, clone);
  expectExit(args, result);
  expect(result.stdout + result.stderr).toContain(`Identity '${chosen}' already has personal records`);
  const incoming = stored(await reader.read({ reference: personal.inbox }));
  expect(incoming).toMatchObject({ reference: published.inbox.reference, version: published.inbox.version, content: capture });
  expect(stored(await reader.history({ reference: personal.inbox }))).toHaveLength(1);
  expect(stored(await reader.read({ reference: personal.memory })).content).toContain("Working Memory");
  await readAbsent(clone, sessionIdentity);
  expect(await git(clone, ["config", "--local", "--get", "arc.identity"])).toBe(chosen);
  expect(await git(clone, ["rev-parse", "HEAD"])).toBe(head);
}, SESSION_COMMAND_TIMEOUT_MS);

it.skipIf(process.platform === "win32").each([
  { verb: "add", response: "decline" }, { verb: "add", response: "cancel" },
  { verb: "init", response: "decline" }, { verb: "init", response: "cancel" },
  { verb: "join", response: "decline" }, { verb: "join", response: "cancel" },
] as const)("$verb preserves setup on $response and proceeds with a different identity", async ({ verb, response }) => {
  const root = await (verb === "init" ? scratchRepo() : sessionRepo());
  const { store, inbox } = await seedCapture(root);
  const before = stored(await store.version());
  const config = await readFile(join(root, ".git", "config"));
  const refs = await codeRefs(root);
  const status = await git(root, ["status", "--porcelain", "--untracked-files=all"]);
  const command = ["--skip-projection", ...argv(verb, chosen)];
  const refused = await refuseIdentityAtTerminal(root, command, chosen, response);
  const transcript = refused.stdout + refused.stderr;
  expect(refused.exitCode, `arc ${command.join(" ")}\n${transcript}`).toBe(1);
  expect(transcript).toContain(`Identity '${chosen}' was not confirmed`);
  expect(transcript).toContain(verb === "add" ? "arc user add <name>" : "--identity <name>");
  expect(await readFile(join(root, ".git", "config"))).toEqual(config);
  expect(await codeRefs(root)).toBe(refs);
  expect(await git(root, ["status", "--porcelain", "--untracked-files=all"])).toBe(status);
  expect(stored(await store.version())).toBe(before);
  expect(stored(await store.read({ reference: personal.inbox }))).toEqual(inbox);
  expect(await store.read({ reference: personal.memory })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  await readAbsent(root, fresh);
  if (verb === "init") await expect(access(join(root, ".arc", "system", "arc-config.yml"))).rejects.toMatchObject({ code: "ENOENT" });

  const retry = ["--skip-projection", "--no-input", ...argv(verb, fresh)];
  const repaired = await runArcNoTty(retry, root);
  expectExit(retry, repaired);
  expect(repaired.stdout + repaired.stderr).toContain(verb === "join" ? "Workspace setup complete" : verb === "init" ? "Installation complete" : fresh);
  const freshStore = fixtureStore(root, fresh);
  const records = personalRecords(fresh);
  expect(stored(await freshStore.read({ reference: records.inbox })).content).toContain("User Inbox");
  expect(stored(await freshStore.read({ reference: records.memory })).content).toContain("Working Memory");
  expect(stored(await store.read({ reference: personal.inbox }))).toEqual(inbox);
  expect(await store.read({ reference: personal.memory })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(await git(root, ["config", "--local", "--get", "arc.identity"])).toBe(verb === "add" ? sessionIdentity : fresh);
  expect(await codeRefs(root)).toBe(refs);
}, SESSION_COMMAND_TIMEOUT_MS);
