/**
 * The incoming-edge re-point sweep — the write half of the dependency rewrite a
 * decomposition runs when it retires an origin into its members.
 *
 * {@link "./lifecycle-deps.ts"}'s `resolveReverseDeps` finds the dependents
 * (the discovery half); this rewrites each one's `**Depends On:**` edge from the
 * retired origin to the delivering member(s). The write is greenfield —
 * `lifecycle-deps.ts` is read-only by contract — but reuses the shared meta-field
 * writer (`setMetaBulletFields`) so it touches only the one bullet and leaves the
 * rest of the meta byte-stable.
 *
 * @module
 */

import {
  formatValue,
  parseIdentifierList,
  parseMetaRecord,
  setMetaBulletFields,
} from "../active/meta-reader.js";

/**
 * Rewrite a dependent meta's `**Depends On:**` edge from `originSlug` to
 * `deliveringMembers`, in place — the origin slot is replaced by the delivering
 * member(s) at its position, every sibling edge is kept, and duplicates collapse.
 * When the meta does not name the origin the content returns byte-identical (a
 * pure no-op, no spurious edit), so the caller can apply it unconditionally.
 *
 * The single delivering-member case re-points one-to-one; multiple members
 * cover a dependency the origin's work split across. The rewritten value is
 * re-formatted as a backticked identifier list, matching how every other meta
 * writer renders the field.
 *
 * @param content - The dependent meta's raw markdown.
 * @param originSlug - The retired origin to re-point away from.
 * @param deliveringMembers - The member slug(s) that now deliver the dependency.
 * @returns The rewritten markdown, or `content` unchanged when the origin is absent.
 */
export function repointDependsOn(
  content: string,
  originSlug: string,
  deliveringMembers: string[],
): string {
  const current = parseIdentifierList(parseMetaRecord(content)["Depends On"]);
  if (!current.includes(originSlug)) return content;

  const rewritten: string[] = [];
  for (const dep of current) {
    if (dep === originSlug) {
      for (const member of deliveringMembers) {
        if (!rewritten.includes(member)) rewritten.push(member);
      }
    } else if (!rewritten.includes(dep)) {
      rewritten.push(dep);
    }
  }

  const value = rewritten.length === 0 ? "[none]" : formatValue(rewritten.join(", "), "identifier-list");
  return setMetaBulletFields(content, { "Depends On": value });
}
