import type { Game } from "../../../shared/types";
import { heldBy } from "../../queue/lib/locks";

function holderNote(g: Game, itemId: number | null): string {
  const item = itemId != null ? g.queue.find((q) => q.id === itemId) : null;
  return item ? `预约 #${item.id}（${item.action}）` : "其他预约";
}

export function plate(g: Game, id: number, owner?: number): boolean {
  const d = g.dishes.find((d) => d.id === id);
  if (!d || d.stage !== "counter") return false;
  const lock = heldBy(g, { kind: "dish", dishId: id });
  if (lock != null && lock !== owner) {
    g.notice = `这道菜已被 ${holderNote(g, lock)} 锁定`;
    return false;
  }
  d.stage = "plated";
  g.selectedDish = id;
  g.notice = "装盘完成，请选中订单后上菜";
  return true;
}
export function discard(g: Game, id: number, owner?: number): boolean {
  if (!g.dishes.some((d) => d.id === id)) return false;
  const lock = heldBy(g, { kind: "dish", dishId: id });
  if (lock != null && lock !== owner) {
    g.notice = `这道菜已被 ${holderNote(g, lock)} 锁定，不能丢弃`;
    return false;
  }
  g.dishes = g.dishes.filter((d) => d.id !== id);
  if (g.selectedDish === id) g.selectedDish = null;
  g.entries.push({
    id: g.nextId++,
    time: g.time,
    label: "丢弃菜品",
    amount: -3,
    kind: "waste",
  });
  g.notice = "已丢弃，浪费成本 ¥3";
  return true;
}
