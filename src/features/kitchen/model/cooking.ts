import type { Game } from "../../../shared/types";
import { recipes } from "../../../shared/catalog";
import { quality } from "../lib/heat";
import { heldBy } from "../../queue/lib/locks";

function holderNote(g: Game, itemId: number | null): string {
  const item = itemId != null ? g.queue.find((q) => q.id === itemId) : null;
  return item ? `预约 #${item.id}（${item.action}）` : "其他预约";
}

/**
 * @param owner 预约执行时传入自身 id，跳过自己持有的锁
 * @returns 是否执行成功
 */
export function cook(
  g: Game,
  portion: number,
  stove: number,
  owner?: number,
): boolean {
  const p = g.portions.find((p) => p.id === portion),
    s = g.stoves.find((s) => s.id === stove);
  if (!p || !s) return false;
  if (s.portion) {
    g.notice = "灶台正在烹饪中，无法重复下锅";
    return false;
  }
  const portionLock = heldBy(g, { kind: "portion", portionId: portion });
  if (portionLock != null && portionLock !== owner) {
    g.notice = `这份食材已被 ${holderNote(g, portionLock)} 锁定`;
    return false;
  }
  const stoveLock = heldBy(g, { kind: "stove", stoveId: stove });
  if (stoveLock != null && stoveLock !== owner) {
    g.notice = `灶台已被 ${holderNote(g, stoveLock)} 锁定`;
    return false;
  }
  if (recipes[p.recipe].station !== s.kind) {
    g.notice = "设备不匹配：意面用汤锅，牛排和沙拉用煎锅";
    return false;
  }
  s.portion = p;
  s.started = g.time;
  g.portions = g.portions.filter((x) => x.id !== portion);
  g.notice = "已经下锅，请在最佳火候起锅";
  return true;
}
export function lift(g: Game, id: number, owner?: number): boolean {
  const s = g.stoves.find((s) => s.id === id);
  if (!s?.portion) return false;
  const stoveLock = heldBy(g, { kind: "stove", stoveId: id });
  if (stoveLock != null && stoveLock !== owner) {
    g.notice = `灶台已被 ${holderNote(g, stoveLock)} 锁定，无法起锅`;
    return false;
  }
  if (g.dishes.length >= 8) {
    g.notice = "出餐台已满，请先上菜或丢弃";
    return false;
  }
  const p = s.portion,
    q = quality(p.recipe, g.time - s.started);
  g.dishes.push({
    id: p.id,
    recipe: p.recipe,
    quality: q,
    cookedAt: g.time,
    stage: "counter",
  });
  s.portion = null;
  g.notice = `起锅完成，品质 ${q}，前往装盘`;
  return true;
}
