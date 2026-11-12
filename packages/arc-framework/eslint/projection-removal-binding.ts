/** Explicit projection policy at checkout-removal composition boundaries. */
import type { Rule } from "eslint";
import type { Node, Property } from "estree";

function property(node: Node | undefined, name: string): Property | undefined {
  if (node?.type !== "ObjectExpression") return undefined;
  return node.properties.find((item): item is Property => item.type === "Property" && (
    (!item.computed && item.key.type === "Identifier" && item.key.name === name)
    || (item.key.type === "Literal" && item.key.value === name)
  ));
}

/** Require an explicit projection policy in the selected command compositions. */
export const projectionRemovalBindingRule: Rule.RuleModule = {
  meta: {
    type: "problem",
    schema: [],
    messages: { missing: "Bind projection removal policy in this checkout-removal composition." },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== "Identifier") return;
        const name = node.callee.name;
        let bound: boolean;
        if (name === "reconcileWorkUnitWorktree" || name === "checkoutMove") {
          bound = property(node.arguments[0], "projectionRemovalSlots") !== undefined;
        } else if (name === "runPark" || name === "runAbandon") {
          bound = property(property(node.arguments[0], "removal")?.value, "check") !== undefined;
        } else return;
        if (!bound) context.report({ node, messageId: "missing" });
      },
    };
  },
};
