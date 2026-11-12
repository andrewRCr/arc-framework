/** Caller-owned policy through identity resolution. */
import { expect, it } from "vitest";
import { resolveIdentityWithPrompt } from "../../src/handlers/shared.js";
import { declarePromptSite } from "../../src/lib/command-input/declaration.js";
import { resolveInteractionContext } from "../../src/lib/command-input/interaction-context.js";
import { scriptGitExec } from "../helpers/git-exec-fake.js";

const explicitSite = declarePromptSite("test.identity.explicit", "text",
  { file: "test.ts", symbol: "explicitSite" }, {
    acquisition: "handler-required", schemaOwnership: "owned", schemaField: "identity", cancellation: "stop",
    automation: { noInput: "require-explicit", flags: ["--identity"], acceptedSyntax: ["--identity <name>"] },
    mutationBoundary: "identity resolution", subprocess: "none",
  });
const context = resolveInteractionContext({ noInput: true, machineReadable: false, ci: false,
  promptInputIsTTY: true, promptOutputIsTTY: true, yes: "absent" });

it("keeps a suggested Git name from answering a caller's explicit-only identity question", async () => {
  const { exec } = scriptGitExec([
    { match: ["config", "--null", "--get", "arc.identity"], responses: [{ failure: { exitCode: 1 } }] },
    { match: ["config", "--get", "user.name"], responses: [{ stdout: "Alice Smith\n" }] },
  ]);
  expect(await resolveIdentityWithPrompt(explicitSite, context, exec)).toBeNull();
});
