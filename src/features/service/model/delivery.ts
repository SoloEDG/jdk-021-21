import type { Game } from "../../../shared/types";
import { recipes } from "../../../shared/catalog";
import { servingQuality, servicePair } from "../lib/freshness";
import { heldBy } from "../../queue/lib/locks";

function holderNote(g: Game, itemId: number | null): string {
  const item = itemId != null ? g.queue.find((q) => q.id === itemId) : null;
  return item ? `预约 #${item.id}（${item.action}）` : "其他预约";
}

/**
 * 即时上菜：沿用界面上选中的菜品与订单。
 */
export function deliver(g: Game): boolean {
  const { dish, order } = servicePair(g);
  if (!dish || !order) {
    g.notice = "请选择已装盘菜品和已接订单";
    return false;
  }
  return deliverFor(g, dish.id, order.id);
}

/**
 * 显式目标上菜，供预约执行调用。绑定的具体订单/菜品不会被静默替换。
 * @param owner 预约执行时传入自身 id，跳过自己持有的锁
 */
export function deliverFor(
  g: Game,
  dishId: number,
  orderId: number,
  owner?: number,
): boolean {
  const dish = g.dishes.find((d) => d.id === dishId);
  const order = g.orders.find((o) => o.id === orderId);
  if (!dish || dish.stage !== "plated" || !order) return false;
  if (order.status !== "accepted") {
    g.notice = "目标订单已离店或已完成，本次上菜预约无法交付";
    return false;
  }
  const dishLock = heldBy(g, { kind: "dish", dishId });
  if (dishLock != null && dishLock !== owner) {
    g.notice = `菜品已被 ${holderNote(g, dishLock)} 锁定`;
    return false;
  }
  const orderLock = heldBy(g, { kind: "order", orderId });
  if (orderLock != null && orderLock !== owner) {
    g.notice = `订单已被 ${holderNote(g, orderLock)} 锁定`;
    return false;
  }
  if (dish.recipe !== order.recipe) {
    order.deadline = Math.max(g.time, order.deadline - 10);
    g.combo = 0;
    g.notice = "上错菜！客人耐心减少10秒，菜品仍留在出餐台";
    return false;
  }
  const q = servingQuality(g, dish);
  if (q < 30) {
    order.deadline = Math.max(g.time, order.deadline - 8);
    g.notice = "品质低于30，客人拒收，耐心减少8秒";
    return false;
  }
  g.combo++;
  g.served++;
  order.status = "served";
  const amount =
    Math.round((recipes[dish.recipe].price * q) / 100) +
    Math.min(10, (g.combo - 1) * 2);
  g.entries.push({
    id: g.nextId++,
    time: g.time,
    label: `${order.guest} · ${recipes[dish.recipe].name}`,
    amount,
    kind: "sale",
  });
  g.dishes = g.dishes.filter((d) => d.id !== dish.id);
  if (g.selectedDish === dish.id) g.selectedDish = null;
  if (g.selectedOrder === order.id) g.selectedOrder = null;
  g.notice = `交付成功 +¥${amount} · 连续交付 ${g.combo} 单`;
  return true;
}
