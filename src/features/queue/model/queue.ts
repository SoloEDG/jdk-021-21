import type {
  Game,
  QueueDraft,
  QueueItem,
  RecipeId,
  ResourceRef,
} from "../../../shared/types";
import { recipes } from "../../../shared/catalog";
import { accept } from "../../orders";
import { prepare } from "../../pantry";
import { cook, lift } from "../../kitchen";
import { plate, discard, deliverFor } from "../../service";
import {
  acquireLocks,
  availableStock,
  heldBy,
  locksOf,
  releaseItemLocks,
  sameRef,
} from "../lib/locks";
/* ------------------------------------------------------------------ */
/* 展示用文案                                                          */
/* ------------------------------------------------------------------ */

export const actionLabels: Record<QueueItem["action"], string> = {
  accept: "接单",
  prepare: "备料",
  cook: "下锅",
  lift: "起锅",
  plate: "装盘",
  serve: "上菜",
  discard: "丢弃",
};

export const actionIcons: Record<QueueItem["action"], string> = {
  accept: "🎫",
  prepare: "🧺",
  cook: "🍳",
  lift: "♨",
  plate: "🍽",
  serve: "↗",
  discard: "×",
};

/** 依据预约字段反推它要锁定的资源 */
export function itemRefs(item: QueueItem): ResourceRef[] {
  const refs: ResourceRef[] = [];
  const push = (r: ResourceRef) => {
    if (!refs.some((x) => sameRef(x, r))) refs.push(r);
  };
  switch (item.action) {
    case "accept":
      if (item.orderId != null) push({ kind: "order", orderId: item.orderId });
      break;
    case "prepare":
      if (item.recipe)
        push({
          kind: "ingredient",
          ingredient: recipes[item.recipe].ingredient,
        });
      break;
    case "cook":
      if (item.stoveId != null) push({ kind: "stove", stoveId: item.stoveId });
      if (item.binding.kind === "portion")
        push({ kind: "portion", portionId: item.binding.portionId });
      break;
    case "lift":
      if (item.stoveId != null) push({ kind: "stove", stoveId: item.stoveId });
      break;
    case "plate":
    case "discard":
      if (item.binding.kind === "dish")
        push({ kind: "dish", dishId: item.binding.dishId });
      break;
    case "serve":
      if (item.binding.kind === "dish")
        push({ kind: "dish", dishId: item.binding.dishId });
      if (item.orderId != null) push({ kind: "order", orderId: item.orderId });
      break;
  }
  return refs;
}

/* ------------------------------------------------------------------ */
/* 入队校验                                                            */
/* ------------------------------------------------------------------ */

export function draftIssue(g: Game, d: QueueDraft): string {
  const stove =
    d.stoveId != null ? g.stoves.find((s) => s.id === d.stoveId) : null;
  switch (d.action) {
    case "accept": {
      const o = d.orderId != null ? g.orders.find((x) => x.id === d.orderId) : null;
      if (!o) return "请选择要预约接单的订单";
      if (o.status !== "waiting") return "该订单已接单或已离店";
      const h = heldBy(g, { kind: "order", orderId: o.id });
      if (h != null) return `订单已被预约 #${h} 锁定`;
      return "";
    }
    case "prepare":
      if (!d.recipe) return "请选择要备料的菜品";
      if (g.portions.length >= 6) return "备料台已满（6份）";
      return "";
    case "cook": {
      if (!stove) return "请选择灶台";
      if (d.bindMode === "specific") {
        const p = d.portionId != null ? g.portions.find((x) => x.id === d.portionId) : null;
        if (!p) return "请选择一份已备食材";
        if (recipes[p.recipe].station !== stove.kind) return "设备不匹配：该食材不能上这个灶台";
      } else if (!d.recipe) return "请指定要等待的菜品";
      return "";
    }
    case "lift":
      if (!stove) return "请选择灶台";
      return "";
    case "plate": {
      if (d.bindMode === "specific") {
        const dish = d.dishId != null ? g.dishes.find((x) => x.id === d.dishId) : null;
        if (!dish) return "请选择出餐台上的菜品";
        if (dish.stage !== "counter") return "该菜品已装盘";
      } else if (!d.recipe) return "请指定要等待的菜品";
      return "";
    }
    case "discard": {
      const dish = d.dishId != null ? g.dishes.find((x) => x.id === d.dishId) : null;
      if (!dish) return "请选择要丢弃的菜品";
      return "";
    }
    case "serve": {
      let recipe: RecipeId | null = d.recipe;
      if (d.bindMode === "specific") {
        const dish = d.dishId != null ? g.dishes.find((x) => x.id === d.dishId) : null;
        if (!dish) return "请选择要上菜的菜品";
        recipe = dish.recipe;
      }
      if (!recipe) return "请指定要上菜的菜品";
      if (d.orderId != null) {
        const o = g.orders.find((x) => x.id === d.orderId);
        if (!o) return "请选择有效订单";
        if (o.status === "left" || o.status === "served") return "该订单已离店或已完成";
        if (o.recipe !== recipe) return "菜品与订单不符，不能绑定";
      }
      return "";
    }
  }
}

/* ------------------------------------------------------------------ */
/* 入队 / 取消 / 清空 / 重排 / 锁                                      */
/* ------------------------------------------------------------------ */

function buildItem(g: Game, d: QueueDraft): QueueItem {
  const item: QueueItem = {
    id: g.nextId++,
    action: d.action,
    status: "queued",
    recipe: d.recipe,
    stoveId: d.stoveId,
    orderId: d.orderId,
    binding: { kind: "none" },
    anchorId: null,
    locked: false,
    createdAt: g.time,
    firedAt: null,
    note: "排队等待中",
    rejectedReason: null,
  };
  switch (d.action) {
    case "cook":
      if (d.bindMode === "next") {
        item.binding = { kind: "next-portion", recipe: d.recipe! };
        item.anchorId = g.portions.reduce((m, p) => Math.max(m, p.id), 0);
      } else {
        item.binding = { kind: "portion", portionId: d.portionId! };
      }
      break;
    case "plate":
      if (d.bindMode === "next") {
        item.binding = { kind: "next-dish", recipe: d.recipe! };
        item.anchorId = g.dishes.reduce((m, x) => Math.max(m, x.id), 0);
      } else {
        item.binding = { kind: "dish", dishId: d.dishId! };
      }
      break;
    case "serve":
      if (d.bindMode === "next") {
        item.binding = { kind: "next-dish", recipe: d.recipe! };
        item.anchorId = g.dishes.reduce((m, x) => Math.max(m, x.id), 0);
      } else if (d.dishId != null) {
        item.binding = { kind: "dish", dishId: d.dishId };
      }
      break;
    case "discard":
      item.binding = { kind: "dish", dishId: d.dishId! };
      break;
    case "accept":
      item.binding = { kind: "order", orderId: d.orderId! };
      break;
  }
  return item;
}

/** 入队；需要提前锁定时，锁申请整体失败则不会创建预约 */
export function addItem(g: Game, d: QueueDraft): QueueItem | string {
  const issue = draftIssue(g, d);
  if (issue) return issue;
  const item = buildItem(g, d);
  if (d.lock) {
    const conflict = acquireLocks(g, item.id, itemRefs(item));
    if (conflict) {
      g.nextId--; // 归还被占用的 id
      const holder = heldBy(g, conflict);
      return holder != null
        ? `资源已被预约 #${holder} 锁定，无法提前占位`
        : "资源已被其他预约锁定";
    }
    item.locked = true;
  }
  g.queue.push(item);
  g.notice = `已加入队列 #${item.id}：${actionLabels[item.action]}${
    item.locked ? "（已锁定资源）" : ""
  }`;
  return item;
}

export function cancelItems(g: Game, ids: number[]) {
  const set = new Set(ids);
  for (const item of g.queue) {
    if (item.status !== "queued" || !set.has(item.id)) continue;
    item.status = "cancelled";
    item.firedAt = g.time;
    item.note = "手动取消，已释放锁定资源";
    releaseItemLocks(g, item.id);
    item.locked = false;
  }
}

/** 移除全部终态记录（已执行/失败/取消不可回滚，只是从界面清掉） */
export function clearTerminal(g: Game) {
  g.queue = g.queue.filter((q) => q.status === "queued");
}

/**
 * 重排仅作用于排队中的预约；已执行步骤（done/failed/cancelled）原地保留，
 * 因此重排不可能回滚任何已发生的动作。
 */
export function moveItems(
  g: Game,
  ids: number[],
  dir: "up" | "down" | "top" | "bottom",
) {
  const set = new Set(ids);
  const original = g.queue;
  const queued = original.filter((q) => q.status === "queued");
  if (!queued.some((q) => set.has(q.id))) return;
  const picked = queued.filter((q) => set.has(q.id));
  const rest = queued.filter((q) => !set.has(q.id));
  let next: QueueItem[];
  if (dir === "top") next = [...picked, ...rest];
  else if (dir === "bottom") next = [...rest, ...picked];
  else if (dir === "up") {
    next = [...queued];
    const idx = next.map((q) => q.id);
    for (const id of idx) {
      if (!set.has(id)) continue;
      const i = next.findIndex((q) => q.id === id);
      if (i > 0 && !set.has(next[i - 1].id)) {
        const [x] = next.splice(i, 1);
        next.splice(i - 1, 0, x);
      }
    }
  } else {
    next = [...queued];
    const idx = next.map((q) => q.id);
    for (let k = idx.length - 1; k >= 0; k--) {
      const id = idx[k];
      if (!set.has(id)) continue;
      const i = next.findIndex((q) => q.id === id);
      if (i < next.length - 1 && !set.has(next[i + 1].id)) {
        const [x] = next.splice(i, 1);
        next.splice(i + 1, 0, x);
      }
    }
  }
  // 按原数组的槽位重建：终态条目位置不动
  let qi = 0;
  g.queue = original.map((q) => (q.status === "queued" ? next[qi++] : q));
}

export function lockItem(g: Game, id: number): string {
  const item = g.queue.find((q) => q.id === id);
  if (!item || item.status !== "queued") return "该预约已结束，不能再锁定";
  const conflict = acquireLocks(g, item.id, itemRefs(item));
  if (conflict) {
    const holder = heldBy(g, conflict);
    return holder != null
      ? `资源已被预约 #${holder} 锁定`
      : "资源已被其他预约锁定";
  }
  item.locked = locksOf(g, item.id).length > 0;
  return item.locked ? "" : "该动作没有可锁定的资源";
}

/* ------------------------------------------------------------------ */
/* 评估与执行                                                          */
/* ------------------------------------------------------------------ */

type Eval =
  | { kind: "ready"; reason: ""; portionId?: number; dishId?: number; orderId?: number }
  | { kind: "blocked"; reason: string }
  | { kind: "invalid"; reason: string };

function fail(g: Game, item: QueueItem, reason: string) {
  item.status = "failed";
  item.firedAt = g.time;
  item.note = reason;
  item.rejectedReason = null;
  releaseItemLocks(g, item.id);
  item.locked = false;
  g.notice = `预约 #${item.id} 失败：${reason}`;
}

function evaluate(g: Game, item: QueueItem): Eval {
  switch (item.action) {
    case "accept": {
      const o = g.orders.find((x) => x.id === item.orderId);
      if (!o || o.status !== "waiting")
        return { kind: "invalid", reason: "目标订单已接单或离店，接单预约失效" };
      return { kind: "ready", reason: "", orderId: o.id };
    }
    case "prepare": {
      const r = item.recipe!;
      if (g.portions.length >= 6) return { kind: "blocked", reason: "备料台已满（6份）" };
      if (availableStock(g, recipes[r].ingredient, item.id) < 1) {
        return {
          kind: "blocked",
          reason:
            g.stock[recipes[r].ingredient] < 1
              ? "食材不足，等待采购"
              : "可用食材已被其他预约锁定",
        };
      }
      return { kind: "ready", reason: "" };
    }
    case "cook": {
      const stove = g.stoves.find((s) => s.id === item.stoveId);
      if (!stove) return { kind: "invalid", reason: "目标灶台不存在" };
      let portionId: number;
      if (item.binding.kind === "portion") {
        const binding = item.binding;
        const p = g.portions.find((x) => x.id === binding.portionId);
        if (!p)
          return {
            kind: "invalid",
            reason: `绑定的食材 #${binding.portionId} 已被别的动作消耗，未替换其他食材`,
          };
        if (recipes[p.recipe].station !== stove.kind)
          return { kind: "invalid", reason: "设备与食材不匹配" };
        portionId = p.id;
      } else {
        const b = item.binding as { kind: "next-portion"; recipe: RecipeId };
        const p = g.portions.find(
          (x) => x.id > (item.anchorId ?? -1) && x.recipe === b.recipe,
        );
        if (!p)
          return { kind: "blocked", reason: `等待下一份「${recipes[b.recipe].name}」备料完成` };
        if (recipes[p.recipe].station !== stove.kind)
          return { kind: "invalid", reason: "设备与菜品不匹配" };
        portionId = p.id;
      }
      if (stove.portion)
        return {
          kind: "blocked",
          reason: `灶台 0${stove.id} 烹饪中（#${stove.portion.id} 占用），等待起锅`,
        };
      const lock = heldBy(g, { kind: "stove", stoveId: stove.id });
      if (lock != null && lock !== item.id)
        return { kind: "blocked", reason: `灶台被预约 #${lock} 锁定，等待释放` };
      const pLock = heldBy(g, { kind: "portion", portionId });
      if (pLock != null && pLock !== item.id)
        return { kind: "blocked", reason: `食材被预约 #${pLock} 锁定` };
      return { kind: "ready", reason: "", portionId };
    }
    case "lift": {
      const stove = g.stoves.find((s) => s.id === item.stoveId);
      if (!stove) return { kind: "invalid", reason: "目标灶台不存在" };
      if (!stove.portion)
        return { kind: "blocked", reason: `灶台 0${stove.id} 空闲，等待下锅后起锅` };
      const lock = heldBy(g, { kind: "stove", stoveId: stove.id });
      if (lock != null && lock !== item.id)
        return { kind: "blocked", reason: `灶台被预约 #${lock} 锁定` };
      return { kind: "ready", reason: "" };
    }
    case "plate": {
      let dishId: number;
      if (item.binding.kind === "dish") {
        const binding = item.binding;
        const d = g.dishes.find((x) => x.id === binding.dishId);
        if (!d)
          return {
            kind: "invalid",
            reason: `绑定的菜品 #${binding.dishId} 已被上菜或丢弃，未替换其他菜品`,
          };
        if (d.stage === "plated")
          return { kind: "invalid", reason: "菜品已装盘，预约无需重复执行" };
        dishId = d.id;
      } else {
        const b = item.binding as { kind: "next-dish"; recipe: RecipeId };
        const d = g.dishes.find(
          (x) =>
            x.id > (item.anchorId ?? -1) &&
            x.recipe === b.recipe &&
            x.stage === "counter",
        );
        if (!d)
          return { kind: "blocked", reason: `等待下一份「${recipes[b.recipe].name}」起锅` };
        dishId = d.id;
      }
      const lock = heldBy(g, { kind: "dish", dishId });
      if (lock != null && lock !== item.id)
        return { kind: "blocked", reason: `菜品被预约 #${lock} 锁定` };
      return { kind: "ready", reason: "", dishId };
    }
    case "discard": {
      if (item.binding.kind !== "dish")
        return { kind: "invalid", reason: "丢弃预约缺少绑定菜品" };
      const binding = item.binding;
      const d = g.dishes.find((x) => x.id === binding.dishId);
      if (!d)
        return {
          kind: "invalid",
          reason: `绑定的菜品 #${binding.dishId} 已不在出餐台`,
        };
      const lock = heldBy(g, { kind: "dish", dishId: d.id });
      if (lock != null && lock !== item.id)
        return { kind: "blocked", reason: `菜品被预约 #${lock} 锁定` };
      return { kind: "ready", reason: "", dishId: d.id };
    }
    case "serve": {
      let dishId: number | null = null;
      let recipe: RecipeId | null = item.recipe;
      if (item.binding.kind === "dish") {
        const binding = item.binding;
        const d = g.dishes.find((x) => x.id === binding.dishId);
        if (!d)
          return {
            kind: "invalid",
            reason: `绑定的菜品 #${binding.dishId} 已被上菜或丢弃，未替换其他菜品`,
          };
        if (d.stage !== "plated")
          return { kind: "blocked", reason: `菜品 #${d.id} 等待装盘` };
        dishId = d.id;
        recipe = d.recipe;
      } else if (item.binding.kind === "next-dish") {
        const b = item.binding;
        const d = g.dishes.find(
          (x) =>
            x.id > (item.anchorId ?? -1) &&
            x.recipe === b.recipe &&
            x.stage === "plated",
        );
        if (!d)
          return { kind: "blocked", reason: `等待下一份已装盘的「${recipes[b.recipe].name}」` };
        dishId = d.id;
        recipe = d.recipe;
      }
      if (dishId != null) {
        const lock = heldBy(g, { kind: "dish", dishId });
        if (lock != null && lock !== item.id)
          return { kind: "blocked", reason: `菜品被预约 #${lock} 锁定` };
      }
      let orderId = item.orderId;
      if (orderId != null) {
        const o = g.orders.find((x) => x.id === orderId);
        if (!o || o.status === "left" || o.status === "served")
          return { kind: "invalid", reason: "目标订单已离店或已完成，上菜预约失效" };
        if (o.status === "waiting")
          return { kind: "blocked", reason: `等待订单 #${String(o.id).padStart(3, "0")} 被接单` };
      } else {
        const o = g.orders.find((x) => x.status === "accepted" && x.recipe === recipe);
        if (!o)
          return { kind: "blocked", reason: `等待匹配「${recipe ? recipes[recipe].name : ""}」的已接订单` };
        orderId = o.id;
      }
      const oLock = heldBy(g, { kind: "order", orderId });
      if (oLock != null && oLock !== item.id)
        return { kind: "blocked", reason: `订单被预约 #${oLock} 锁定` };
      if (dishId == null)
        return { kind: "blocked", reason: "等待可交付的菜品" };
      return { kind: "ready", reason: "", dishId, orderId };
    }
  }
}

function runOne(g: Game, item: QueueItem, ev: Eval): "fired" | "rejected" | "noop" {
  if (ev.kind !== "ready") return "noop";
  const before = g.notice;
  let ok = false;
  switch (item.action) {
    case "accept":
      ok = accept(g, ev.orderId!, item.id);
      break;
    case "prepare":
      ok = prepare(g, item.recipe!, item.id);
      break;
    case "cook":
      ok = cook(g, ev.portionId!, item.stoveId!, item.id);
      break;
    case "lift":
      ok = lift(g, item.stoveId!, item.id);
      break;
    case "plate":
      ok = plate(g, ev.dishId!, item.id);
      break;
    case "discard":
      ok = discard(g, ev.dishId!, item.id);
      break;
    case "serve":
      ok = deliverFor(g, ev.dishId!, ev.orderId!, item.id);
      break;
  }
  if (!ok) {
    // 条件看似满足但业务规则拒收（如品质过低、上错菜）：保留排队状态并写明原因，
    // 由玩家决定等待还是取消，绝不能静默重试或改派目标。
    if (g.notice && g.notice !== before) {
      item.note = g.notice;
      item.rejectedReason = g.notice;
    }
    return "rejected";
  }
  item.status = "done";
  item.firedAt = g.time;
  item.note = `已于 ${g.time.toFixed(1)}s 执行`;
  item.rejectedReason = null;
  releaseItemLocks(g, item.id);
  item.locked = false;
  return "fired";
}

/**
 * 队列推进：仅在营业运行时由计时循环与 dispatch 调用。
 * 多趟扫描，保证同一时刻满足条件的预约按队列顺序依次执行；
 * 终态预约不会再次被评估，因此任何动作至多执行一次。
 * 以“本时间片实际执行的动作数”作为上限，避免无效空转，也不会漏掉链路上的后续步骤。
 */
export function pump(g: Game) {
  if (!g.running || g.ended) return;
  const maxFires = g.queue.filter((q) => q.status === "queued").length + 1;
  let fires = 0;
  let changed = true;
  while (changed && fires < maxFires) {
    changed = false;
    for (const item of g.queue) {
      if (item.status !== "queued") continue;
      const ev = evaluate(g, item);
      if (ev.kind === "invalid") {
        fail(g, item, ev.reason);
        changed = true;
        break;
      }
      if (ev.kind === "blocked") {
        if (item.note !== ev.reason) item.note = ev.reason;
        continue;
      }
      const outcome = runOne(g, item, ev);
      if (outcome === "fired") {
        fires++;
        changed = true;
        break; // 资源状态已变，从头按顺序重新评估
      }
      if (outcome === "rejected") {
        // 业务拒收：本条保持 queued+原因，继续评估后面的预约，避免无限重启
        continue;
      }
    }
  }
}
/**
 * 手动“立即执行”：目标可执行则推进整条队列，否则把等待原因提示给玩家。
 * 暂停时不执行任何烹饪动作，仅提示先恢复营业。
 */
export function runNow(g: Game, id: number) {
  const item = g.queue.find((q) => q.id === id);
  if (!item || item.status !== "queued") return;
  if (!g.running || g.ended) {
    g.notice = "已暂停：可编辑队列，但预约要恢复营业后才能执行";
    return;
  }
  const ev = evaluate(g, item);
  if (ev.kind === "ready") {
    pump(g);
    const after = g.queue.find((q) => q.id === id);
    if (after?.rejectedReason) g.notice = `预约 #${id} 被拒收：${after.rejectedReason}`;
  } else if (ev.kind === "blocked") {
    g.notice = `预约 #${id} 暂不能执行：${ev.reason}`;
  } else {
    fail(g, item, ev.reason);
  }
}

export function itemState(g: Game, item: QueueItem) {
  if (item.status !== "queued")
    return { kind: item.status, reason: item.note } as const;
  // 业务拒收优先展示；条件恢复后 evaluate 会重新给出 ready/blocked
  if (item.rejectedReason)
    return { kind: "blocked", reason: `拒收：${item.rejectedReason}` } as const;
  const ev = evaluate(g, item);
  if (ev.kind === "ready") {
    item.rejectedReason = null;
    return { kind: "ready", reason: "条件满足，等待执行" } as const;
  }
  return { kind: ev.kind, reason: ev.reason } as const;
}

/** 打烊：取消全部未完成预约并释放锁，终态记录保留 */
export function cancelAllForClose(g: Game) {
  for (const item of g.queue) {
    if (item.status !== "queued") continue;
    item.status = "cancelled";
    item.firedAt = g.time;
    item.note = "已打烊，预约取消";
    releaseItemLocks(g, item.id);
    item.locked = false;
  }
}
