export type RecipeId = "steak" | "pasta" | "salad";
export type Ingredient = "beef" | "noodle" | "greens";
export interface Recipe {
  id: RecipeId;
  name: string;
  icon: string;
  ingredient: Ingredient;
  station: "pan" | "pot";
  target: number;
  price: number;
}
export interface Order {
  id: number;
  recipe: RecipeId;
  guest: string;
  arrived: number;
  deadline: number;
  status: "waiting" | "accepted" | "served" | "left";
}
export interface Portion {
  id: number;
  recipe: RecipeId;
  preparedAt: number;
}
export interface Stove {
  id: number;
  kind: "pan" | "pot";
  portion: Portion | null;
  started: number;
}
export interface Dish {
  id: number;
  recipe: RecipeId;
  quality: number;
  cookedAt: number;
  stage: "counter" | "plated";
}
export interface Entry {
  id: number;
  time: number;
  label: string;
  amount: number;
  kind: "sale" | "waste" | "miss" | "supply";
}

/* ---------- 操作队列 ---------- */

export type QueueAction =
  | "accept"
  | "prepare"
  | "cook"
  | "lift"
  | "plate"
  | "serve"
  | "discard";

export type ItemStatus = "queued" | "done" | "failed" | "cancelled";

/**
 * 预约绑定：
 * - specific 系列（portion/dish/order）绑定某一份具体食品/订单，目标消失即失败，绝不替换
 * - next 系列（next-portion/next-dish）等待锚点之后出现的下一份指定菜品
 */
export type QueueBinding =
  | { kind: "none" }
  | { kind: "portion"; portionId: number }
  | { kind: "next-portion"; recipe: RecipeId }
  | { kind: "dish"; dishId: number }
  | { kind: "next-dish"; recipe: RecipeId }
  | { kind: "order"; orderId: number };

export type ResourceRef =
  | { kind: "ingredient"; ingredient: Ingredient }
  | { kind: "stove"; stoveId: number }
  | { kind: "portion"; portionId: number }
  | { kind: "dish"; dishId: number }
  | { kind: "order"; orderId: number };

export interface Lock {
  id: number;
  itemId: number;
  resource: ResourceRef;
}

export interface QueueItem {
  id: number;
  action: QueueAction;
  status: ItemStatus;
  /** 备料动作的菜品；next 系列绑定的菜品也存一份冗余便于展示 */
  recipe: RecipeId | null;
  /** 下锅/起锅动作的灶台 */
  stoveId: number | null;
  /** 上菜/接单动作绑定的具体订单（null 表示执行时再匹配订单） */
  orderId: number | null;
  binding: QueueBinding;
  /** next 系列绑定创建时的实体 id 锚点，只接受 id 更大的后续实体 */
  anchorId: number | null;
  /** 是否提前锁定了资源（锁定明细存放在 game.locks） */
  locked: boolean;
  createdAt: number;
  firedAt: number | null;
  /** 最近一次评估的等待原因 / 终态说明 */
  note: string;
  /** 条件满足但被业务规则拒收时的原因（如品质过低），恢复可执行后清空 */
  rejectedReason: string | null;
}

export interface QueueDraft {
  action: QueueAction;
  recipe: RecipeId | null;
  stoveId: number | null;
  portionId: number | null;
  dishId: number | null;
  orderId: number | null;
  bindMode: "specific" | "next";
  lock: boolean;
}

export interface Game {
  time: number;
  duration: number;
  running: boolean;
  ended: boolean;
  nextId: number;
  selectedOrder: number | null;
  selectedDish: number | null;
  orders: Order[];
  stock: Record<Ingredient, number>;
  portions: Portion[];
  stoves: Stove[];
  dishes: Dish[];
  entries: Entry[];
  queue: QueueItem[];
  locks: Lock[];
  combo: number;
  served: number;
  missed: number;
  notice: string;
  best: number;
}
export type Command =
  | { type: "accept"; id: number }
  | { type: "select-order"; id: number }
  | { type: "prepare"; recipe: RecipeId }
  | { type: "cook"; portion: number; stove: number }
  | { type: "lift"; id: number }
  | { type: "plate"; id: number }
  | { type: "select-dish"; id: number }
  | { type: "serve" }
  | { type: "discard"; id: number }
  | { type: "restock"; ingredient: Ingredient }
  | { type: "q-add"; draft: QueueDraft }
  | { type: "q-cancel"; ids: number[] }
  | { type: "q-move"; ids: number[]; dir: "up" | "down" | "top" | "bottom" }
  | { type: "q-lock"; id: number }
  | { type: "q-release"; id: number }
  | { type: "q-run"; id: number }
  | { type: "q-clear" }
  | { type: "q-release-lock"; lockId: number };
