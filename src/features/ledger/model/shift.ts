import type { Game } from "../../../shared/types";
import { totals } from "../lib/totals";
import { cancelAllForClose } from "../../queue";
export function closeShift(g: Game) {
  g.running = false;
  g.ended = true;
  g.portions = [];
  g.dishes = [];
  g.stoves.forEach((s) => (s.portion = null));
  // 打烊：未完成的预约全部取消并释放锁，已执行记录保留在队列中
  cancelAllForClose(g);
  g.best = Math.max(g.best, totals(g).net);
  g.notice = "午市结束，辛苦了，主厨！";
}
export function saveBest(g: Game) {
  try {
    localStorage.setItem("lunch-rush-best", String(g.best));
  } catch {
    g.notice = "浏览器存储不可用，本局结算仍然有效";
  }
}
export function readBest() {
  try {
    const v = Number(localStorage.getItem("lunch-rush-best"));
    return Number.isFinite(v) ? Math.max(0, v) : 0;
  } catch {
    return 0;
  }
}
