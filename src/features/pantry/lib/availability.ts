import type { Game, RecipeId } from "../../../shared/types";
import { recipes } from "../../../shared/catalog";
import { availableStock, heldBy } from "../../queue/lib/locks";
/**
 * 备料可行性检查。锁定的食材视为已被预约占用：
 * 即时点击拿不到时会指明是哪条预约持有资源。
 */
export function preparationIssue(
  g: Game,
  r: RecipeId,
  owner?: number,
): string {
  if (g.portions.length >= 6) return "备料台已满（6份）";
  const i = recipes[r].ingredient;
  if (availableStock(g, i, owner) < 1) {
    if (g.stock[i] < 1) return "食材不足，请采购";
    const holder = heldBy(g, { kind: "ingredient", ingredient: i });
    const item = holder != null ? g.queue.find((q) => q.id === holder) : null;
    return item
      ? `食材已被预约 #${item.id}（${item.action}）锁定，可在队列中释放`
      : "可用食材已被预约锁定";
  }
  return "";
}
