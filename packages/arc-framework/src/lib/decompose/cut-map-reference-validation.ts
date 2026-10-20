/** Declared destination references and dependency-recipient boundaries. */
import type { CutMap } from "./cut-map-schema.js";
import type { CutMapIssue } from "./cut-map-issues.js";

/** Reject source targets that do not name a declared destination. */
export function cutSourceTargetIssue({ authoring }: CutMap): CutMapIssue | null {
  const declared = new Set(authoring.destinations.map(({ destinationId }) => destinationId));
  const index = authoring.sourceAllocations.findIndex(({ disposition }) =>
    disposition.kind === "target" && !declared.has(disposition.destinationId));
  return index < 0 ? null : {
    code: "authoring-identity", path: `authoring.sourceAllocations.${index}.disposition.destinationId`,
    message: "Reference one destinationId declared by authoring.destinations.",
  };
}

/** Limit dependencies to work-unit destinations, with the extraction origin on incoming edges. */
export function cutDependencyTargetIssue({ machine, authoring }: CutMap): CutMapIssue | null {
  const recipients = new Set(authoring.destinations.flatMap(destination => {
    if (destination.kind === "new-member") return [destination.slug];
    if (destination.kind === "existing-home" && destination.target.kind === "work-unit") return [destination.target.slug];
    return [];
  }));
  const incomingRecipients = new Set(recipients);
  if (authoring.shape === "extraction") incomingRecipients.add(machine.origin.slug);
  const references = [
    ...authoring.internalEdges.flatMap((edge, index) => (["from", "to"] as const).map(field => ({
      path: `authoring.internalEdges.${index}.${field}`, target: edge[field], recipients,
    }))),
    ...authoring.externalEdges.map((edge, index) => ({
      path: `authoring.externalEdges.${index}.from`, target: edge.from, recipients,
    })),
    ...authoring.incomingDispositions.flatMap(({ disposition }, index) => disposition.kind === "replace"
      ? disposition.replacementTargets.map((target, targetIndex) => ({
        path: `authoring.incomingDispositions.${index}.disposition.replacementTargets.${targetIndex}`,
        target, recipients: incomingRecipients,
      })) : []),
    ...authoring.outgoingDispositions.flatMap(({ disposition }, index) => disposition.kind === "targets"
      ? disposition.targets.map((target, targetIndex) => ({
        path: `authoring.outgoingDispositions.${index}.disposition.targets.${targetIndex}`, target, recipients,
      })) : []),
  ];
  const invalid = references.find(reference => !reference.recipients.has(reference.target));
  return invalid === undefined ? null : {
    code: "authoring-identity", path: invalid.path,
    message: "Reference one dependency-capable destination declared by authoring.destinations.",
  };
}
