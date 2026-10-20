/** Shared status identity reads fall back without prompting. */
import { expect, it } from "vitest";
import { readIdentityPointers } from "../../../src/handlers/identity-pointers.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";

it("resolves the slugified Git name when no ARC identity is configured", async () => {
  const { exec } = scriptGitExec([
    { match: ["config", "--null", "--get", "arc.identity"], responses: [{ failure: { exitCode: 1 } }] },
    { match: ["config", "--get", "user.name"], responses: [{ stdout: "Andrew Creekmore\n" }] },
    { match: ["config", "--get", "arc.role"], responses: [{ stdout: "maintainer\n" }] },
  ]);
  await expect(readIdentityPointers(exec)).resolves.toEqual({ identity: "andrew-creekmore", role: "maintainer" });
});
