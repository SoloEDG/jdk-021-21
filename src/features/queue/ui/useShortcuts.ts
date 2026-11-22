import { onMounted, onUnmounted } from "vue";
import type { Game, Command, QueueDraft } from "../../../shared/types";
import { addItem, moveItems, cancelItems, pump } from "../model/queue";
import { ui, keyRepeated } from "./state";

/**
 * 全局快捷键：
 *  Q 备料 / W 下锅 / E 起锅 / R 装盘 / T 上菜（基于当前选择与选中条目）
 *  ↑↓ 上移/下移 · Home/End 置顶/置底 · Delete/Esc 取消选中
 * 按住不放产生的系统重复事件在 250ms 内去重，保证连续触发也不会重复入队；
 * 已执行的预约不会再次入队或回滚（引擎仅评估 queued 条目）。
 */
export function useShortcuts(
  game: Game,
  dispatch: (c: Command) => void,
  toggle: () => void,
) {
  function quickDraft(): QueueDraft | null {
    const d = ui.draft;
    switch (d.action) {
      case "prepare":
        return { ...d, action: "prepare" };
      case "cook":
        return { ...d, action: "cook" };
      case "lift":
        return { ...d, action: "lift" };
      case "plate":
        return { ...d, action: "plate" };
      case "serve":
        return { ...d, action: "serve" };
      default:
        return null;
    }
  }

  function onKey(ev: KeyboardEvent) {
    const target = ev.target as HTMLElement | null;
    if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;

    if (ev.code === "Space") {
      // 让按钮自身的空格激活保持可用，只在非交互元素上切换暂停
      if (target && ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName))
        return;
      ev.preventDefault();
      toggle();
      return;
    }

    const ids = [...ui.selected];
    if (["ArrowUp", "ArrowDown", "Home", "End", "Delete", "Escape"].includes(ev.code)) {
      if (!ids.length) return;
      ev.preventDefault();
      if (keyRepeated()) return;
      if (ev.code === "ArrowUp") moveItems(game, ids, "up");
      else if (ev.code === "ArrowDown") moveItems(game, ids, "down");
      else if (ev.code === "Home") moveItems(game, ids, "top");
      else if (ev.code === "End") moveItems(game, ids, "bottom");
      else {
        cancelItems(game, ids);
        ui.selected.clear();
      }
      pump(game);
      return;
    }

    const map: Record<string, QueueDraft["action"]> = {
      KeyQ: "prepare",
      KeyW: "cook",
      KeyE: "lift",
      KeyR: "plate",
      KeyT: "serve",
    };
    const action = map[ev.code];
    if (!action) return;
    ev.preventDefault();
    if (keyRepeated()) return; // 连续触发：同一动作至多入队一次

    // 优先对已勾选的排队条目做「立即执行」，而不是新增预约
    const first = game.queue.find((q) => q.status === "queued" && ui.selected.has(q.id));
    if (first && ["cook", "lift", "plate", "serve"].includes(first.action)) {
      dispatch({ type: "q-run", id: first.id });
      return;
    }

    ui.draft.action = action;
    const draft = quickDraft();
    if (!draft) return;
    const r = addItem(game, draft);
    if (typeof r === "string") game.notice = `快捷键入队失败：${r}`;
    else pump(game);
  }

  onMounted(() => window.addEventListener("keydown", onKey));
  onUnmounted(() => window.removeEventListener("keydown", onKey));
}
