import type { Game } from "../../../shared/types";
import { activeOrders } from "../lib/patience";
import { heldBy, releaseItemLocks } from "../../queue/lib/locks";

function holderNote(g: Game, itemId: number | null): string {
  const item = itemId != null ? g.queue.find((q) => q.id === itemId) : null;
  return item ? `预约 #${item.id}（${item.action}）` : "其他预约";
}

/** @param owner 预约执行时传入自身 id */
export function accept(g: Game, id: number, owner?: number): boolean {
  const o = g.orders.find((o) => o.id === id);
  if (o?.status !== "waiting") return false;
  const lock = heldBy(g, { kind: "order", orderId: id });
  if (lock != null && lock !== owner) {
    g.notice = `该订单已被 ${holderNote(g, lock)} 锁定`;
    return false;
  }
  o.status = "accepted";
  g.selectedOrder = id;
  g.notice = "已接单，请备料并留意客人耐心。";
  return true;
}
export function expire(g: Game) {
  for (const o of activeOrders(g)) {
    if (g.time >= o.deadline) {
      o.status = "left";
      g.missed++;
      g.combo = 0;
      if (g.selectedOrder === o.id) g.selectedOrder = null;
      g.entries.push({
        id: g.nextId++,
        time: g.time,
        label: `${o.guest} 等待超时`,
        amount: -5,
        kind: "miss",
      });
      g.notice = `${o.guest} 离店，损失 ¥5`;
      // 绑定该订单的预约：目标离店即失败，绝不改派给其他订单
      for (const item of g.queue) {
        if (item.status !== "queued") continue;
        const tied =
          item.orderId === o.id ||
          (item.binding.kind === "order" && item.binding.orderId === o.id);
        if (tied) {
          item.status = "failed";
          item.firedAt = g.time;
          item.note = `目标订单 #${String(o.id).padStart(3, "0")}（${o.guest}）已离店，预约失效，未替换其他订单`;
          releaseItemLocks(g, item.id);
        }
      }
    }
  }
}
export function arrive(g: Game) {
  if (g.time >= 150 || activeOrders(g).length >= 6) return;
  const seq = Math.floor(g.time / 18);
  const list = ["steak", "pasta", "salad"] as const;
  g.orders.push({
    id: g.nextId++,
    recipe: list[seq % 3],
    guest: ["阿宁", "许小姐", "赵先生", "晓晴"][seq % 4],
    arrived: g.time,
    deadline: g.time + 60 + (seq % 3) * 5,
    status: "waiting",
  });
}
