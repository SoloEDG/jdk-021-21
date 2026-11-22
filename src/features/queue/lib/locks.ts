import type {
  Game,
  Ingredient,
  Lock,
  ResourceRef,
} from "../../../shared/types";
import { ingredients } from "../../../shared/catalog";

export function locksOf(g: Game, itemId: number): Lock[] {
  return g.locks.filter((l) => l.itemId === itemId);
}

export function holdersOf(g: Game, ref: ResourceRef): Lock[] {
  return g.locks.filter((l) => sameRef(l.resource, ref));
}

export function heldBy(g: Game, ref: ResourceRef): number | null {
  const l = g.locks.find((x) => sameRef(x.resource, ref));
  return l ? l.itemId : null;
}

export function sameRef(a: ResourceRef, b: ResourceRef): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "ingredient":
      return a.ingredient === (b as { ingredient: Ingredient }).ingredient;
    case "stove":
      return a.stoveId === (b as { stoveId: number }).stoveId;
    case "portion":
      return a.portionId === (b as { portionId: number }).portionId;
    case "dish":
      return a.dishId === (b as { dishId: number }).dishId;
    case "order":
      return a.orderId === (b as { orderId: number }).orderId;
  }
}

/** 已被预约锁定（不含本预约自己）的食材份数 */
export function lockedIngredient(g: Game, i: Ingredient, self?: number): number {
  return g.locks.filter(
    (l) =>
      l.resource.kind === "ingredient" &&
      l.resource.ingredient === i &&
      l.itemId !== self,
  ).length;
}

export function availableStock(g: Game, i: Ingredient, self?: number): number {
  return g.stock[i] - lockedIngredient(g, i, self);
}

export function resourceLabel(g: Game, ref: ResourceRef): string {
  switch (ref.kind) {
    case "ingredient":
      return `食材·${ingredients[ref.ingredient].name}`;
    case "stove":
      return `灶台·0${ref.stoveId}`;
    case "portion":
      return `备料·#${ref.portionId}`;
    case "dish":
      return `菜品·#${ref.dishId}`;
    case "order":
      return `订单·#${String(ref.orderId).padStart(3, "0")}`;
  }
}

/** 释放某条预约持有的全部锁 */
export function releaseItemLocks(g: Game, itemId: number) {
  g.locks = g.locks.filter((l) => l.itemId !== itemId);
}

/** 释放单条锁（资源面板上的手动释放，预约本身保留） */
export function releaseLock(g: Game, lockId: number): boolean {
  const lock = g.locks.find((l) => l.id === lockId);
  if (!lock) return false;
  g.locks = g.locks.filter((l) => l.id !== lockId);
  const item = g.queue.find((q) => q.id === lock.itemId);
  if (item) item.locked = locksOf(g, item.id).length > 0;
  return true;
}

/**
 * 为预约申请一组资源锁；任一资源已被别人占用则整体失败（原子性）。
 * @returns 失败时返回冲突的资源，成功返回 null
 */
export function acquireLocks(
  g: Game,
  itemId: number,
  refs: ResourceRef[],
): ResourceRef | null {
  for (const ref of refs) {
    if (holdersOf(g, ref).some((l) => l.itemId !== itemId)) return ref;
  }
  for (const ref of refs) {
    if (locksOf(g, itemId).some((l) => sameRef(l.resource, ref))) continue;
    g.locks.push({ id: g.nextId++, itemId, resource: ref });
  }
  return null;
}

