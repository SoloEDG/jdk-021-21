<script setup lang="ts">
import type { Game, Stove, Command, QueueDraft, RecipeId } from "../../../shared/types";
import { recipes } from "../../../shared/catalog";
import { heatLabel } from "../lib/heat";
import { heldBy } from "../../queue/lib/locks";
const props = defineProps<{ game: Game; stove: Stove }>();
const emit = defineEmits<{ command: [cmd: Command] }>();

function reserveCook(portionId: number) {
  const draft: QueueDraft = {
    action: "cook",
    recipe: null,
    stoveId: props.stove.id,
    portionId,
    dishId: null,
    orderId: null,
    bindMode: "specific",
    lock: true,
  };
  emit("command", { type: "q-add", draft });
}
function reserveCookNext(recipe: RecipeId) {
  const draft: QueueDraft = {
    action: "cook",
    recipe,
    stoveId: props.stove.id,
    portionId: null,
    dishId: null,
    orderId: null,
    bindMode: "next",
    lock: true,
  };
  emit("command", { type: "q-add", draft });
}
function reserveLift() {
  const draft: QueueDraft = {
    action: "lift",
    recipe: null,
    stoveId: props.stove.id,
    portionId: null,
    dishId: null,
    orderId: null,
    bindMode: "specific",
    lock: true,
  };
  emit("command", { type: "q-add", draft });
}
const nextCandidates: RecipeId[] = ["steak", "pasta", "salad"];
</script>
<template>
  <article class="stove" :class="{ cooking: stove.portion }">
    <div class="stove-head">
      <b>{{ stove.kind === "pan" ? "煎锅" : "汤锅" }} 0{{ stove.id }}</b
      ><span class="status-dot">{{ heatLabel(game, stove) }}</span>
    </div>
    <div class="burner">
      <div class="pan-shape">
        <span>{{
          stove.portion ? recipes[stove.portion.recipe].icon : "＋"
        }}</span>
      </div>
      <div v-if="stove.portion" class="flame">♨ ♨ ♨</div>
    </div>
    <template v-if="stove.portion"
      ><strong>{{ recipes[stove.portion.recipe].name }}</strong>
      <p class="timer">
        {{ (game.time - stove.started).toFixed(1)
        }}<small> / {{ recipes[stove.portion.recipe].target }} 秒</small>
      </p>
      <div class="heat-track">
        <i
          :style="{
            width:
              Math.min(
                100,
                ((game.time - stove.started) /
                  (recipes[stove.portion.recipe].target * 1.8)) *
                  100,
              ) + '%',
          }"
        ></i
        ><span></span>
      </div>
      <button
        class="warm"
        @click="emit('command', { type: 'lift', id: stove.id })"
      >
        起锅
      </button>
      <button
        class="tiny soft reserve-btn"
        :disabled="heldBy(game, { kind: 'stove', stoveId: stove.id }) != null"
        @click="reserveLift"
      >
        🕘 预约起锅（锁定灶台）
      </button></template
    ><template v-else
      ><p class="muted">等待食材下锅</p>
      <div class="portion-picker">
        <template
          v-for="p in game.portions.filter(
            (p) => recipes[p.recipe].station === stove.kind,
          )"
          :key="p.id"
        >
          <button
            class="tiny soft"
            @click="
              emit('command', { type: 'cook', portion: p.id, stove: stove.id })
            "
          >
            {{ recipes[p.recipe].icon }} #{{ p.id }} 下锅
          </button>
          <button class="tiny reserve-inline" @click="reserveCook(p.id)">
            🕘 预约
          </button>
        </template>
        <small
          v-if="
            !game.portions.some((p) => recipes[p.recipe].station === stove.kind)
          "
          >先到备料台准备食材</small
        >
        <div class="reserve-next">
          <small class="muted">没有合适食材？等下一份：</small>
          <button
            v-for="r in nextCandidates.filter(
              (id) => recipes[id].station === stove.kind,
            )"
            :key="r"
            class="tiny soft"
            @click="reserveCookNext(r)"
          >
            等{{ recipes[r].icon }}{{ recipes[r].name }}
          </button>
        </div>
      </div></template
    >
  </article>
</template>
