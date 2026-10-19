/** Setup preserves a selected person's records and stops before writes on a declined identity. */
import { expect, it } from "vitest";
import { runPostInitSetup } from "../../src/lib/setup.js";
import { runUserAdd } from "../../src/commands/user/add.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import type { UserIOContext } from "../../src/commands/user/types.js";
const owner = OwnerIdentitySchema.parse({ type: "person", name: "other-person" });
const inbox = recordReferences["personal/inbox"](owner), memory = recordReferences["personal/working-memory"](owner);
function fixture() {
  const h = createLifecycleHarness(), files = new Map<string, string>(), config = new Map<string, string>();
  const io: UserIOContext = {
    readFile: async path => path.endsWith("WORKING-MEMORY.md") ? "# Memory\n\n## Memories\n" : "# Inbox\n\n## Work Unit\n",
    writeFile: async (path, content) => { files.set(path, content); }, mkdir: async () => {},
    exec: async (_cmd, args) => { if (args[0] === "config" && args[1] === "--local") config.set(args[2]!, args[3]!); return { stdout: "" }; },
    readDir: async () => [], writeNote: async () => {}, readNote: async () => null,
  };
  const options = { cwd: "/repo", arcDir: "/repo/.arc", io, internalTemplateDir: "/templates", identity: "other-person", identityResult: "other-person", store: h.store };
  return { ...h, files, config, options };
}
it.each(["add", "post-init"])("%s creates both selected identity records without workspace files", async verb => {
  const h = fixture();
  if (verb === "add") await runUserAdd(h.options); else await runPostInitSetup(h.options);
  expect(lifecycleSuccess(await h.store.read({ reference: inbox })).content).toContain("## Work Unit");
  expect(lifecycleSuccess(await h.store.read({ reference: memory })).content).toContain("## Memories");
  expect(h.files.size).toBe(0);
});
it.each(["add", "post-init"])("%s retains an existing record and creates only its missing companion", async verb => {
  const h = fixture(), existing = await h.seed(inbox, "# Inbox\n\n## Work Unit\n\n### **Keep mine**\n\n- _Id:_ `12345678`\n");
  const options = { ...h.options, confirmIdentityInUse: async () => true };
  if (verb === "add") await runUserAdd(options); else await runPostInitSetup(options);
  expect(lifecycleSuccess(await h.store.read({ reference: inbox }))).toEqual(existing);
  expect(lifecycleSuccess(await h.store.read({ reference: memory })).content).toContain("## Memories");
});
it.each(["add", "post-init"])("%s declines before changing the configured identity or either record", async verb => {
  const h = fixture(), existing = await h.seed(memory, "# Memory\n\n## Memories\n");
  const options = { ...h.options, confirmIdentityInUse: async () => false };
  await expect(verb === "add" ? runUserAdd(options) : runPostInitSetup(options)).rejects.toMatchObject({ code: "identity.in-use", whatToDo: expect.stringContaining(verb === "add" ? "arc user add" : "--identity") });
  expect(h.config.size).toBe(0);
  expect(await h.store.read({ reference: inbox })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(lifecycleSuccess(await h.store.read({ reference: memory }))).toEqual(existing);
});

it.each(["init", "join"] as const)("%s declines an occupied identity before changing any setup state", async command => {
  const h = fixture();
  const { runInit } = await import("../../src/commands/init.js");
  const { runJoin } = await import("../../src/commands/join.js");
  const { DEFAULT_PROMPTS } = await import("../helpers/integration.js");
  const { initIdentityInUsePromptSite, joinIdentityInUsePromptSite } = await import("../../src/prompts/identity-prompt-sites.js");
  const { confirmPersonalIdentity } = await import("../../src/handlers/identity-setup.js");
  const { resolveInteractionContext } = await import("../../src/lib/command-input/interaction-context.js");
  const { CLACK_PROMPT_RENDERER } = await import("../../src/lib/command-input/prompt-renderer.js");
  const context = resolveInteractionContext({ noInput: false, ci: false, machineReadable: false, promptInputIsTTY: true, promptOutputIsTTY: true, yes: "absent" });
  await h.seed(inbox, "# Inbox\n\n## Work Unit\n");
  const options = { ...h.options, templateDir: "/templates", io: { ...h.options.io, access: async () => {}, chmod: async () => {}, exclusiveCreate: async () => {}, removeFile: async () => {} },
    confirmIdentityInUse: confirmPersonalIdentity(command === "init" ? initIdentityInUsePromptSite : joinIdentityInUsePromptSite, context,
      { ...CLACK_PROMPT_RENDERER, confirm: async () => ({ kind: "answered", value: false }) }) };
  const operation = command === "join" ? runJoin({ ...options, prompts: { role: "maintainer", tools: [] } })
    : runInit({ ...options, prompts: DEFAULT_PROMPTS, recipe: { prompts: [], conditions: {} } });
  await expect(operation).rejects.toMatchObject({ code: "identity.in-use", whatToDo: expect.stringContaining("--identity <name>") });
  expect(h.config.size).toBe(0);
  expect(h.files.size).toBe(0);
  expect(await h.store.read({ reference: memory })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
});
it("an explicitly cancelled confirmation stops while the no-input default proceeds", async () => {
  const { userAddIdentityInUsePromptSite } = await import("../../src/prompts/identity-prompt-sites.js");
  const { confirmPersonalIdentity } = await import("../../src/handlers/identity-setup.js");
  const { resolveInteractionContext } = await import("../../src/lib/command-input/interaction-context.js");
  const { CLACK_PROMPT_RENDERER } = await import("../../src/lib/command-input/prompt-renderer.js");
  const signals = { noInput: false, ci: false, machineReadable: false, promptInputIsTTY: true, promptOutputIsTTY: true, yes: "absent" as const };
  const renderer = { ...CLACK_PROMPT_RENDERER, confirm: async () => ({ kind: "cancelled" as const }) };
  const h = fixture(), existing = await h.seed(inbox, "# Inbox\n\n## Work Unit\n");
  await expect(runUserAdd({ ...h.options, confirmIdentityInUse: confirmPersonalIdentity(userAddIdentityInUsePromptSite,
    resolveInteractionContext(signals), renderer) })).rejects.toMatchObject({ code: "identity.in-use" });
  expect(lifecycleSuccess(await h.store.read({ reference: inbox }))).toEqual(existing);
  expect(await h.store.read({ reference: memory })).toMatchObject({ status: "refused" });
  await runUserAdd({ ...h.options, confirmIdentityInUse: confirmPersonalIdentity(userAddIdentityInUsePromptSite,
    resolveInteractionContext({ ...signals, noInput: true }), renderer) });
  expect(lifecycleSuccess(await h.store.read({ reference: memory })).content).toContain("Memories");
});
it("choosing another identity after declining creates only that person's records", async () => {
  const h = fixture(), existing = await h.seed(inbox, "# Inbox\n\n## Work Unit\n");
  await expect(runUserAdd({ ...h.options, confirmIdentityInUse: async () => false })).rejects.toMatchObject({ code: "identity.in-use" });
  await runUserAdd({ ...h.options, identity: "different-person", confirmIdentityInUse: async () => false });
  const otherOwner = OwnerIdentitySchema.parse({ type: "person", name: "different-person" });
  expect(lifecycleSuccess(await h.store.read({ reference: recordReferences["personal/inbox"](otherOwner) })).content).toContain("Work Unit");
  expect(lifecycleSuccess(await h.store.read({ reference: recordReferences["personal/working-memory"](otherOwner) })).content).toContain("Memories");
  expect(lifecycleSuccess(await h.store.read({ reference: inbox }))).toEqual(existing);
});
it("preserves working memory when only the personal inbox is missing", async () => {
  const h = fixture(), existing = await h.seed(memory, "# Memory\n\n## Memories\n\n**Keep this:**\n_Remove when:_ Never\n\nA useful personal note.\n");
  await runUserAdd({ ...h.options, confirmIdentityInUse: async () => true });
  expect(lifecycleSuccess(await h.store.read({ reference: memory }))).toEqual(existing);
  expect(lifecycleSuccess(await h.store.read({ reference: inbox })).content).toContain("Work Unit");
});
it("preserves a record created by another setup after the absence check", async () => {
  const { vi } = await import("vitest");
  const h = fixture(), write = h.store.write.bind(h.store);
  let inserted = false;
  const content = "# Memory\n\n## Memories\n\n**Concurrent setup:**\n_Remove when:_ Never\n_Id:_ `12345678`\n\nRetain this new person's prose.\n";
  vi.spyOn(h.store, "write").mockImplementation(async input => {
    if (input.action !== "put") throw new Error("Fixture expects a personal record put");
    if (!inserted && input.reference.kind === "personal/working-memory") {
      inserted = true;
      lifecycleSuccess(await write({ ...input, content }));
    }
    return write(input);
  });
  await runUserAdd(h.options);
  expect(lifecycleSuccess(await h.store.read({ reference: memory })).content).toBe(content);
  expect(lifecycleSuccess(await h.store.history({ reference: memory }))).toHaveLength(1);
  expect(lifecycleSuccess(await h.store.read({ reference: inbox })).content).toContain("Work Unit");
});
