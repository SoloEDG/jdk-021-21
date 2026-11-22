import type { Game, Command } from "../shared/types";
import { accept, expire } from "../features/orders";
import { prepare, restock } from "../features/pantry";
import { cook, lift } from "../features/kitchen";
import { plate, discard, deliver } from "../features/service";
import {
  addItem,
  cancelItems,
  clearTerminal,
  moveItems,
  lockItem,
  pump,
  runNow,
} from "../features/queue";
import { releaseLock } from "../features/queue/lib/locks";

/** 队列编辑类指令：暂停时也允许，但不会推进烹饪 */
const QUEUE_EDIT = new Set<Command["type"]>([
  "q-add",
  "q-cancel",
  "q-move",
  "q-lock",
  "q-release",
  "q-clear",
  "q-release-lock",
]);

export function dispatch(g: Game, c: Command) {
  if (g.ended) {
    g.notice = "已打烊，厨房停止运作；可重新开局";
    return;
  }
  const editing = QUEUE_EDIT.has(c.type);
  if (!g.running && !editing) {
    g.notice = "已暂停：即时操作冻结，仍可编辑操作队列";
    return;
  }
  switch (c.type) {
    case "accept":
      accept(g, c.id);
      break;
    case "select-order":
      if (g.orders.some((o) => o.id === c.id && o.status === "accepted"))
        g.selectedOrder = c.id;
      break;
    case "prepare":
      prepare(g, c.recipe);
      break;
    case "restock":
      restock(g, c.ingredient);
      break;
    case "cook":
      cook(g, c.portion, c.stove);
      break;
    case "lift":
      lift(g, c.id);
      break;
    case "plate":
      plate(g, c.id);
      break;
    case "select-dish":
      if (g.dishes.some((d) => d.id === c.id && d.stage === "plated"))
        g.selectedDish = c.id;
      break;
    case "serve":
      deliver(g);
      expire(g);
      break;
    case "discard":
      discard(g, c.id);
      break;
    /* ---------------- 操作队列 ---------------- */
    case "q-add": {
      const r = addItem(g, c.draft);
      if (typeof r === "string") g.notice = `无法加入队列：${r}`;
      break;
    }
    case "q-cancel":
      cancelItems(g, c.ids);
      g.notice = `已取消 ${c.ids.length} 条预约并释放其锁定资源`;
      break;
    case "q-move":
      moveItems(g, c.ids, c.dir);
      break;
    case "q-lock": {
      const issue = lockItem(g, c.id);
      if (issue) g.notice = issue;
      else g.notice = `预约 #${c.id} 已提前锁定资源`;
      break;
    }
    case "q-release": {
      // 释放某条预约的全部锁（预约保留，转为执行时再竞争）
      const item = g.queue.find((q) => q.id === c.id);
      if (item) {
        g.locks = g.locks.filter((l) => l.itemId !== item.id);
        item.locked = false;
        g.notice = `已释放预约 #${c.id} 的锁定，执行时再竞争资源`;
      }
      break;
    }
    case "q-run":
      runNow(g, c.id);
      break;
    case "q-clear":
      clearTerminal(g);
      break;
    case "q-release-lock":
      if (releaseLock(g, c.lockId)) g.notice = "已释放该资源锁，预约仍然保留";
      break;
  }
  // 任何变动后（含暂停时的编辑）尝试推进；pump 内部会在暂停/打烊时直接返回
  pump(g);
}
