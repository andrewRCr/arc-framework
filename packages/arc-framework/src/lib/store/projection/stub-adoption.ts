/** Inspect prospective backlog metadata without creating a work item. */
import { parseMetaCreationFields } from "../../active/meta-reader.js";
import type { ArcLayoutAddress } from "../../layout/index.js";
import { validateStubParameters, type StubParameterVerdict } from "../../work-unit/verbs/stub-parameters.js";
import type { RefusedMark } from "./index-schema.js";

type Container = Extract<ArcLayoutAddress, { kind: "work-unit-container" }>;
/** An admissible proposed stub, or the reason it must remain unadopted. */
export type ProspectiveStub = { readonly kind: "stub"; readonly params: Extract<StubParameterVerdict, { status: "valid" }>["params"] }
  | { readonly kind: "refused"; readonly mark: RefusedMark };

/** Read only the creation inputs owned by a prospective stub's metadata and physical location. */
export function inspectProspectiveStub(container: Container, content: string, identity: string): ProspectiveStub {
  if (container.placement.kind !== "backlog") return refused("A new stub needs a backlog folder.", "Move the metadata into a provisional or planned work-item folder, then retry.");
  let fields: ReturnType<typeof parseMetaCreationFields>;
  let owner: string | null;
  try { fields = parseMetaCreationFields(content); owner = fields.owner; }
  catch (error) { return refused(`The prospective stub's metadata does not parse: ${error instanceof Error ? error.message : String(error)}`,
    "Repair the metadata's H1 and core table, or create its stub with arc stub, then retry."); }
  if (owner !== null && owner !== identity) return refused(`The prospective stub names Owner ${owner}.`,
    `Name yourself (${identity}) as Owner, adopt the stub, then run arc handover ${container.slug} --to ${owner}.`);
  const verdict = validateStubParameters({ name: container.slug, commitment: container.placement.commitment,
    priority: fields.priority ?? undefined, owner: identity,
    ...(fields.origin === null ? {} : { origin: fields.origin }),
    ...(fields.design === null ? {} : { design: fields.design }),
    ...(fields.workClass === null ? {} : { cls: fields.workClass }),
    ...(container.placement.cohort.length === 0 ? {} : { cohort: container.placement.cohort.join("/") }),
  });
  return verdict.status === "rejected" ? refused(verdict.reason, "Repair the named arc stub parameters in the metadata or path, then retry adoption.")
    : { kind: "stub", params: verdict.params };
}

function refused(reason: string, remedy: string): Extract<ProspectiveStub, { kind: "refused" }> {
  return { kind: "refused", mark: { reason, remedy: { text: remedy } } };
}
