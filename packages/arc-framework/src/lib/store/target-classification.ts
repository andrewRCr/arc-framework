/** Translate layout file addresses to their declared store roles. */
import { assertNever } from "../kernel/index.js";
import type { ArcLayoutAddress } from "../layout/index.js";
import type { KindId } from "./catalog.js";
/** Logical target identity independent of a projected directory. */
export interface ClassifiedStoreTarget { kind: KindId; key?: string; workItem?: string; identity?: string; entryList: boolean }
const artifactKinds = { meta: "work-item/meta", draft: "work-item/draft", spec: "work-item/spec", tasks: "work-item/task-list", notes: "work-item/notes" } as const;
/** Resolve the kind and key owned by a file address, exhaustively over the address vocabulary. */
export function classifyStoreAddress(address: ArcLayoutAddress): ClassifiedStoreTarget | null {
  switch (address.kind) {
    case "work-unit-artifact": return { kind: artifactKinds[address.artifact], workItem: address.slug, entryList: false };
    case "candidate-record": return { kind: "review/candidate", workItem: address.slug, entryList: false };
    case "integration-boundary-record": return { kind: "review/integration-boundary", workItem: address.slug, entryList: false };
    case "transition-record": return { kind: "lineage/transition", workItem: address.origin, entryList: false };
    case "inbox": return address.scope.kind === "project" ? { kind: "project-inbox/inbox", entryList: true }
      : { kind: "personal/inbox", identity: address.scope.identity, entryList: true };
    case "user-document": return address.document.kind === "working-memory" ? { kind: "personal/working-memory", identity: address.identity, entryList: true }
      : { kind: "personal/session-context", key: address.document.workUnit, identity: address.identity, entryList: false };
    case "cohort-document": return { kind: "cohort/document", entryList: false };
    case "arc-root": case "editor-document-root": case "editor-document": case "placement-root": case "work-unit-container":
    case "procedure-root": case "project-document": case "user-root": return null;
    default: return assertNever(address);
  }
}
