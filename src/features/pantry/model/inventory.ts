import type { Game, RecipeId, Ingredient } from "../../../shared/types";
import { recipes, ingredients } from "../../../shared/catalog";
import { preparationIssue } from "../lib/availability";
import { availableStock } from "../../queue/lib/locks";
/**
 * @param owner 预约执行时传入自身 id，以便忽略自己持有的食材锁；
 *              即时点击不传，遇到锁定资源会返回原因。
 * @returns 是否执行成功
 */
export function prepare(g: Game, r: RecipeId, owner?: number): boolean {
  const issue = preparationIssue(g, r, owner);
  if (issue) {
    g.notice = issue;
    return false;
  }
  g.stock[recipes[r].ingredient]--;
  g.portions.push({ id: g.nextId++, recipe: r, preparedAt: g.time });
  g.notice = `${recipes[r].name} 备料完成，可送入灶台`;
  return true;
}
export function restock(g: Game, i: Ingredient) {
  if (g.stock[i] >= 12) {
    g.notice = "库存充足，上限12份";
    return;
  }
  g.stock[i] = Math.min(12, g.stock[i] + 3);
  g.entries.push({
    id: g.nextId++,
    time: g.time,
    label: `采购${ingredients[i].name} ×3`,
    amount: -ingredients[i].cost * 3,
    kind: "supply",
  });
  g.notice = "已购入3份食材，费用计入账本";
}
