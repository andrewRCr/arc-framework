/** Conservative qualification of this example's own Node installation and actual probes. */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { childEnvironment } from "./local-inputs.mjs";

export async function qualifyNodeRuntime(plan, execute) {
  const unknown = reason => ({ kind: "unknown", reason });
  const probes = [...plan.probes.global, ...plan.probes.check];
  if ([...plan.invocations, ...probes].some(command => command.shell || command.argv[0] !== process.execPath)) {
    return unknown("Known mode covers this Node installation only; other executables or shells require their own provider qualification.");
  }
  const environment = childEnvironment(plan, {}, undefined);
  const options = environment.NODE_OPTIONS ?? "";
  if (environment.NODE_PATH || !/^(?:\s*--max-old-space-size(?:=|\s+)\d+)*\s*$/u.test(options)) {
    return unknown("Custom Node module paths or startup options prevent this example from qualifying its runtime.");
  }
  try {
    const fingerprint = async () => {
      const hash = createHash("sha256");
      for await (const bytes of createReadStream(process.execPath)) hash.update(bytes);
      hash.update(JSON.stringify({ platform: process.platform, arch: process.arch, versions: process.versions, options }));
      return `sha256:${hash.digest("hex")}`;
    };
    const identity = await fingerprint();
    const results = [];
    for (const probe of probes) {
      const result = await execute(probe);
      if (result.outcome.status !== "completed" || result.outcome.exitCode !== 0 || result.overflow) return unknown("A requested runtime probe failed or exceeded this example's 1 MiB stdout limit.");
      const stdout = new TextDecoder("utf-8", { fatal: true }).decode(result.stdout);
      results.push({ id: probe.id, stdout });
    }
    if (await fingerprint() !== identity) return unknown("The Node installation changed during qualification; retry after it is stable.");
    return { kind: "known", bindings: plan.invocations.map(invocation => ({ invocationId: invocation.id, identity,
      probes: results.map(result => ({ ...result })) })) };
  } catch { return unknown("The actual prepared Node runtime or exact probe stdout could not be established."); }
}
