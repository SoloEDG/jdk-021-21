<script setup lang="ts">
import { computed } from "vue";
import type { Game, Command, QueueAction, QueueDraft } from "../../../shared/types";
import { recipeList, recipes } from "../../../shared/catalog";
import {
  actionLabels,
  actionIcons,
  itemState,
  itemRefs,
  draftIssue,
} from "../model/queue";
import { locksOf, resourceLabel } from "../lib/locks";
import { bindingView } from "./binding";
import { ui, toggleSelected, clearSelection } from "./state";

const props = defineProps<{ game: Game }>();
const emit = defineEmits<{ command: [cmd: Command] }>();

const queued = computed(() => props.game.queue.filter((q) => q.status === "queued"));
const terminal = computed(() =>
  props.game.queue.filter((q) => q.status !== "queued"),
);

const actionOptions: QueueAction[] = [
  "accept",
  "prepare",
  "cook",
  "lift",
  "plate",
  "serve",
  "discard",
];

const draft = ui.draft;

function resetTargets() {
  draft.portionId = null;
  draft.dishId = null;
  draft.orderId = null;
  draft.stoveId = null;
}

function pickAction(a: QueueAction) {
  draft.action = a;
  resetTargets();
  draft.bindMode = "specific";
}

const showRecipe = computed(() =>
  ["prepare"].includes(draft.action) ||
  ((draft.action === "cook" || draft.action === "plate" || draft.action === "serve") &&
    draft.bindMode === "next"),
);
const showStove = computed(() => draft.action === "cook" || draft.action === "lift");
const showPortion = computed(() => draft.action === "cook" && draft.bindMode === "specific");
const showDish = computed(
  () =>
    ["plate", "discard", "serve"].includes(draft.action) &&
    draft.bindMode === "specific",
);
const showOrder = computed(() => draft.action === "accept" || draft.action === "serve");
const canBindNext = computed(() => ["cook", "plate", "serve"].includes(draft.action));

const waitingOrders = computed(() =>
  props.game.orders.filter((o) => o.status === "waiting"),
);
const acceptedOrders = computed(() =>
  props.game.orders.filter((o) => o.status === "accepted"),
);
const counterDishes = computed(() =>
  props.game.dishes.filter((d) => d.stage === "counter"),
);
const platedDishes = computed(() =>
  props.game.dishes.filter((d) => d.stage === "plated"),
);

const issue = computed(() => draftIssue(props.game, draft));

function submit() {
  const d: QueueDraft = { ...draft };
  emit("command", { type: "q-add", draft: d });
}

const selectedIds = computed(() => [...ui.selected]);
const selectedQueued = computed(() =>
  queued.value.filter((q) => ui.selected.has(q.id)),
);

function move(dir: "up" | "down" | "top" | "bottom") {
  if (!selectedIds.value.length) return;
  emit("command", { type: "q-move", ids: selectedIds.value, dir });
}
function cancelSelected() {
  if (!selectedIds.value.length) return;
  emit("command", { type: "q-cancel", ids: selectedIds.value });
  clearSelection();
}
function selectAll() {
  if (selectedQueued.value.length === queued.value.length) clearSelection();
  else queued.value.forEach((q) => ui.selected.add(q.id));
}

const lockBoard = computed(() =>
  props.game.locks.map((l) => ({
    lock: l,
    item: props.game.queue.find((q) => q.id === l.itemId),
  })),
);

const occupied = computed(() => [
  ...props.game.stoves
    .filter((s) => s.portion)
    .map((s) => ({
      key: `stove-${s.id}`,
      text: `灶台 0${s.id} 烹饪 #${s.portion!.id} ${
        recipes[s.portion!.recipe].icon
      }`,
    })),
  ...props.game.portions.map((p) => ({
    key: `portion-${p.id}`,
    text: `备料台 #${p.id} ${recipes[p.recipe].icon}${recipes[p.recipe].name}`,
  })),
  ...props.game.dishes.map((d) => ({
    key: `dish-${d.id}`,
    text: `出餐台 #${d.id} ${recipes[d.recipe].icon}${recipes[d.recipe].name}`,
  })),
]);

function stateClass(item: (typeof props.game.queue)[number]) {
  const s = itemState(props.game, item);
  return s.kind;
}
</script>

<template>
  <section class="queue-section panel">
    <div class="section-heading">
      <div>
        <span class="eyebrow">06 / ACTION QUEUE</span>
        <h2>
          操作队列 <span class="count">{{ queued.length }} 条待执行</span>
        </h2>
      </div>
      <span class="muted"
        >快捷键 Q 备料 · W 下锅 · E 起锅 · R 装盘 · T 上菜 · 方向键重排 ·
        Delete 取消</span
      >
    </div>

    <!-- 预约编辑器 -->
    <div class="queue-builder">
      <div class="builder-row">
        <button
          v-for="a in actionOptions"
          :key="a"
          class="tiny"
          :class="{ active: draft.action === a }"
          @click="pickAction(a)"
        >
          {{ actionIcons[a] }} {{ actionLabels[a] }}
        </button>
      </div>
      <div class="builder-row fields">
        <label v-if="showRecipe">
          菜品
          <select v-model="draft.recipe">
            <option v-for="r in recipeList" :key="r.id" :value="r.id">
              {{ r.icon }} {{ r.name }}
            </option>
          </select>
        </label>
        <label v-if="canBindNext">
          绑定方式
          <select v-model="draft.bindMode">
            <option value="specific">绑定指定的一份</option>
            <option value="next">等待下一份指定菜品</option>
          </select>
        </label>
        <label v-if="showStove">
          灶台
          <select v-model="draft.stoveId">
            <option :value="null" disabled>选择灶台</option>
            <option v-for="s in game.stoves" :key="s.id" :value="s.id">
              {{ s.kind === "pan" ? "煎锅" : "汤锅" }} 0{{ s.id }}
            </option>
          </select>
        </label>
        <label v-if="showPortion">
          食材
          <select v-model="draft.portionId">
            <option :value="null" disabled>选择已备食材</option>
            <option v-for="p in game.portions" :key="p.id" :value="p.id">
              #{{ p.id }} {{ recipes[p.recipe].icon }}{{ recipes[p.recipe].name }}
            </option>
          </select>
        </label>
        <label v-if="showDish">
          菜品
          <select v-model="draft.dishId">
            <option :value="null" disabled>选择出餐台菜品</option>
            <option
              v-for="d in draft.action === 'discard' || draft.action === 'plate'
                ? counterDishes
                : platedDishes"
              :key="d.id"
              :value="d.id"
            >
              #{{ d.id }} {{ recipes[d.recipe].icon }}{{ recipes[d.recipe].name }}
              · {{ d.stage === "plated" ? "已装盘" : "待装盘" }}
            </option>
          </select>
        </label>
        <label v-if="showOrder">
          订单
          <select v-model="draft.orderId">
            <option :value="null">
              {{ draft.action === "serve" ? "执行时自动匹配" : "选择订单" }}
            </option>
            <option
              v-for="o in draft.action === 'accept' ? waitingOrders : acceptedOrders"
              :key="o.id"
              :value="o.id"
            >
              #{{ String(o.id).padStart(3, "0") }} {{ o.guest }} ·
              {{ recipes[o.recipe].name }}
            </option>
          </select>
        </label>
        <label class="lock-switch">
          <input type="checkbox" v-model="draft.lock" />
          提前锁定资源
        </label>
        <button :disabled="!!issue" @click="submit">＋ 加入队列</button>
      </div>
      <p v-if="issue" class="builder-issue">⚠ {{ issue }}</p>
      <p v-else class="muted builder-hint">
        实线标签 = 绑定具体食品，目标消失即失败；虚线标签 = 等待下一份指定菜品，不会挪用别的订单
      </p>
    </div>

    <!-- 批量操作条 -->
    <div v-if="queued.length" class="batch-bar">
      <button class="tiny soft" @click="selectAll">
        {{ selectedQueued.length === queued.length ? "取消全选" : "全选" }}
      </button>
      <template v-if="selectedIds.length">
        <button class="tiny soft" @click="move('top')">置顶</button>
        <button class="tiny soft" @click="move('up')">上移</button>
        <button class="tiny soft" @click="move('down')">下移</button>
        <button class="tiny soft" @click="move('bottom')">置底</button>
        <button class="tiny danger" @click="cancelSelected">
          取消选中（{{ selectedIds.length }}）
        </button>
      </template>
      <span class="muted"
        >已执行/失败/取消的记录不可重排、不可回滚，仅可「清空记录」</span
      >
    </div>

    <!-- 队列 -->
    <div class="queue-list">
      <article
        v-for="(item, idx) in game.queue"
        :key="item.id"
        class="queue-row"
        :class="[
          stateClass(item),
          { picked: ui.selected.has(item.id) },
        ]"
      >
        <input
          v-if="item.status === 'queued'"
          type="checkbox"
          :checked="ui.selected.has(item.id)"
          @change="toggleSelected(item.id)"
          :aria-label="'选择预约 ' + item.id"
        />
        <span v-else class="row-index">–</span>
        <span class="row-index">{{ idx + 1 }}</span>
        <span class="row-icon">{{ actionIcons[item.action] }}</span>
        <div class="row-main">
          <div class="row-title">
            <b>#{{ item.id }} {{ actionLabels[item.action] }}</b>
            <span
              v-if="item.recipe"
              class="chip chip-neutral"
              >{{ recipes[item.recipe].icon }}{{ recipes[item.recipe].name }}</span
            >
            <span v-if="item.stoveId != null" class="chip chip-neutral"
              >灶台 0{{ item.stoveId }}</span
            >
            <span
              class="chip"
              :class="{
                'chip-specific': bindingView(game, item).tone === 'specific',
                'chip-next': bindingView(game, item).tone === 'next',
                'chip-order': bindingView(game, item).tone === 'order',
              }"
              >{{ bindingView(game, item).text }}</span
            >
            <span v-if="item.locked" class="chip chip-locked"
              >🔒 已锁定 {{ locksOf(game, item.id).length }} 项</span
            >
            <span v-else-if="item.status === 'queued'" class="chip chip-compete"
              >执行时竞争</span
            >
          </div>
          <p class="row-note">{{ itemState(game, item).reason }}</p>
        </div>
        <div class="row-actions">
          <template v-if="item.status === 'queued'">
            <button
              class="tiny"
              @click="emit('command', { type: 'q-run', id: item.id })"
            >
              立即执行
            </button>
            <button
              v-if="!item.locked && itemRefs(item).length"
              class="tiny soft"
              @click="emit('command', { type: 'q-lock', id: item.id })"
            >
              锁定
            </button>
            <button
              v-else-if="item.locked"
              class="tiny soft"
              @click="emit('command', { type: 'q-release', id: item.id })"
            >
              释放锁
            </button>
            <button
              class="tiny danger"
              @click="
                emit('command', { type: 'q-cancel', ids: [item.id] })
              "
            >
              取消
            </button>
          </template>
          <span v-else class="terminal-tag" :class="item.status">
            {{
              item.status === "done"
                ? "✓ 已执行"
                : item.status === "failed"
                  ? "✕ 失败"
                  : "⊘ 已取消"
            }}
          </span>
        </div>
      </article>
      <div v-if="!game.queue.length" class="empty queue-empty">
        队列为空：用上方编辑器预约，或在订单/灶台/出餐台卡片上点「预约…」快速入队
      </div>
    </div>
    <div v-if="terminal.length" class="terminal-bar">
      <span class="muted">终态记录 {{ terminal.length }} 条（动作至多执行一次，不可回滚）</span>
      <button class="tiny soft" @click="emit('command', { type: 'q-clear' })">
        清空记录
      </button>
    </div>

    <!-- 锁定与占用（分别展示） -->
    <div class="resource-boards">
      <div class="lock-board">
        <h3>🔒 预约锁定 <span class="muted">{{ game.locks.length }}</span></h3>
        <p v-if="!lockBoard.length" class="muted">暂无锁定，资源可自由使用</p>
        <div v-for="row in lockBoard" :key="row.lock.id" class="resource-row">
          <span>{{ resourceLabel(game, row.lock.resource) }}</span>
          <b
            >预约 #{{ row.lock.itemId }}
            {{ row.item ? actionIcons[row.item.action] + actionLabels[row.item.action] : "" }}</b
          >
          <button
            class="tiny soft"
            @click="
              emit('command', { type: 'q-release-lock', lockId: row.lock.id })
            "
          >
            释放
          </button>
        </div>
      </div>
      <div class="occupy-board">
        <h3>♨ 实际占用 <span class="muted">{{ occupied.length }}</span></h3>
        <p v-if="!occupied.length" class="muted">暂无设备/食材被占用</p>
        <div v-for="row in occupied" :key="row.key" class="resource-row">
          <span>{{ row.text }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
