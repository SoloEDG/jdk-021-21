import { reactive } from "vue";
import type { QueueDraft, QueueAction, RecipeId } from "../../../shared/types";

/** 队列界面的本地交互状态：勾选集合、表单草稿、快捷键去重时间戳 */
export const ui = reactive({
  selected: new Set<number>(),
  lastKeyAt: 0,
  draft: {
    action: "prepare" as QueueAction,
    recipe: "steak" as RecipeId | null,
    stoveId: null as number | null,
    portionId: null as number | null,
    dishId: null as number | null,
    orderId: null as number | null,
    bindMode: "specific" as "specific" | "next",
    lock: false,
  } as QueueDraft,
});

export function toggleSelected(id: number) {
  if (ui.selected.has(id)) ui.selected.delete(id);
  else ui.selected.add(id);
}

export function clearSelection() {
  ui.selected.clear();
}

/** 同一按键的系统重复事件（按住不放）在 250ms 内只生效一次 */
export function keyRepeated(): boolean {
  const now = Date.now();
  if (now - ui.lastKeyAt < 250) return true;
  ui.lastKeyAt = now;
  return false;
}
