import type { Game, QueueItem } from "../../../shared/types";
import { recipes } from "../../../shared/catalog";

export interface BindingView {
  /** specific = 绑定具体实体（实线）；next = 等待下一份指定菜品（虚线） */
  tone: "specific" | "next" | "order" | "none";
  text: string;
}

export function bindingView(g: Game, item: QueueItem): BindingView {
  const b = item.binding;
  switch (b.kind) {
    case "none":
      return { tone: "none", text: "执行时再匹配" };
    case "order": {
      const o = g.orders.find((x) => x.id === b.orderId);
      return {
        tone: "order",
        text: o
          ? `订单 #${String(o.id).padStart(3, "0")} · ${o.guest}`
          : `订单 #${String(b.orderId).padStart(3, "0")}（已消失）`,
      };
    }
    case "portion": {
      const p = g.portions.find((x) => x.id === b.portionId);
      return {
        tone: "specific",
        text: p
          ? `食材 #${p.id} ${recipes[p.recipe].icon}${recipes[p.recipe].name}`
          : `食材 #${b.portionId}（已被消耗）`,
      };
    }
    case "next-portion":
      return {
        tone: "next",
        text: `等下一份 ${recipes[b.recipe].icon}${recipes[b.recipe].name} 备料`,
      };
    case "dish": {
      const d = g.dishes.find((x) => x.id === b.dishId);
      return {
        tone: "specific",
        text: d
          ? `菜品 #${d.id} ${recipes[d.recipe].icon}${recipes[d.recipe].name}`
          : `菜品 #${b.dishId}（已消失）`,
      };
    }
    case "next-dish":
      return {
        tone: "next",
        text: `等下一份 ${recipes[b.recipe].icon}${recipes[b.recipe].name}`,
      };
  }
}
