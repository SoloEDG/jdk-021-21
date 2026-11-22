<script setup lang="ts">
import type { Game, Command, QueueDraft, RecipeId } from "../../../shared/types";
import { recipes, recipeList } from "../../../shared/catalog";
import { servingQuality, servicePair } from "../lib/freshness";
import { heldBy } from "../../queue/lib/locks";
const props = defineProps<{ game: Game }>();
const emit = defineEmits<{ command: [cmd: Command] }>();

function reservePlate(dishId: number) {
  const draft: QueueDraft = {
    action: "plate",
    recipe: null,
    stoveId: null,
    portionId: null,
    dishId,
    orderId: null,
    bindMode: "specific",
    lock: true,
  };
  emit("command", { type: "q-add", draft });
}
function reservePlateNext(recipe: RecipeId) {
  const draft: QueueDraft = {
    action: "plate",
    recipe,
    stoveId: null,
    portionId: null,
    dishId: null,
    orderId: null,
    bindMode: "next",
    lock: false,
  };
  emit("command", { type: "q-add", draft });
}
function reserveServe(dishId: number, orderId: number | null) {
  const draft: QueueDraft = {
    action: "serve",
    recipe: null,
    stoveId: null,
    portionId: null,
    dishId,
    orderId,
    bindMode: "specific",
    lock: true,
  };
  emit("command", { type: "q-add", draft });
}
function reserveServeNext(recipe: RecipeId, orderId: number | null) {
  const draft: QueueDraft = {
    action: "serve",
    recipe,
    stoveId: null,
    portionId: null,
    dishId: null,
    orderId,
    bindMode: "next",
    lock: !!orderId,
  };
  emit("command", { type: "q-add", draft });
}
</script>
<template>
  <section class="panel service-panel">
    <span class="eyebrow">04 / PASS & SERVE</span>
    <h2>装盘与上菜 <span class="small">SERVE</span></h2>
    <div class="dish-list">
      <article
        v-for="d in game.dishes"
        :key="d.id"
        class="dish-row"
        :class="{ selected: game.selectedDish === d.id }"
      >
        <span class="dish-icon">{{ recipes[d.recipe].icon }}</span>
        <div>
          <b>{{ recipes[d.recipe].name }}</b
          ><small
            >品质 {{ servingQuality(game, d) }} ·
            {{ d.stage === "plated" ? "已装盘" : "待装盘" }}</small
          >
        </div>
        <button
          class="tiny soft"
          @click="
            emit('command', {
              type: d.stage === 'counter' ? 'plate' : 'select-dish',
              id: d.id,
            })
          "
        >
          {{ d.stage === "counter" ? "装盘" : "选择" }}</button
        >
        <button
          v-if="d.stage === 'counter'"
          class="tiny reserve-inline"
          :disabled="heldBy(game, { kind: 'dish', dishId: d.id }) != null"
          @click="reservePlate(d.id)"
        >
          🕘 预约装盘
        </button>
        <button
          v-if="d.stage === 'plated'"
          class="tiny reserve-inline"
          :disabled="heldBy(game, { kind: 'dish', dishId: d.id }) != null"
          @click="reserveServe(d.id, servicePair(game).order?.id ?? null)"
        >
          🕘 预约上菜
        </button>
        <button
          class="trash"
          aria-label="丢弃菜品"
          @click="emit('command', { type: 'discard', id: d.id })"
        >
          ×
        </button>
      </article>
      <div v-if="!game.dishes.length" class="empty plate-empty">
        <div>◌</div>
        这里等待你的第一道美味<small>起锅 → 装盘 → 选择订单 → 上菜</small>
      </div>
    </div>
    <div class="reserve-next service-reserve">
      <small class="muted">预约「等下一份」（菜品还没做也能排）：</small>
      <div class="reserve-next-row">
        <button
          v-for="r in recipeList"
          :key="r.id"
          class="tiny soft"
          @click="reservePlateNext(r.id)"
        >
          等装盘·{{ r.icon }}
        </button>
      </div>
      <div class="reserve-next-row">
        <button
          v-for="r in recipeList"
          :key="r.id"
          class="tiny soft"
          @click="reserveServeNext(r.id, servicePair(game).order?.id ?? null)"
        >
          等上菜·{{ r.icon }}
        </button>
      </div>
    </div>
    <div class="delivery-target">
      上菜目标：<b>{{ servicePair(game).order?.guest || "尚未选择订单" }}</b>
    </div>
    <button
      class="serve-button"
      @click="emit('command', { type: 'serve' })"
    >
      上菜 <span>↗</span>
    </button>
    <p class="muted">错配扣10秒耐心 · 起锅15秒后开始失温 · 预约绑定的订单离店即失效，不会改派</p>
  </section>
</template>
