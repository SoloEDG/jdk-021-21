<script setup lang="ts">
import type { Game, Command, QueueDraft } from "../../../shared/types";
import { recipeList, recipes } from "../../../shared/catalog";
import IngredientShelf from "./IngredientShelf.vue";
import { preparationIssue } from "../lib/availability";
import { availableStock, lockedIngredient } from "../../queue/lib/locks";
defineProps<{ game: Game }>();
const emit = defineEmits<{ command: [cmd: Command] }>();

function reservePrep(recipe: QueueDraft["recipe"]) {
  const draft: QueueDraft = {
    action: "prepare",
    recipe,
    stoveId: null,
    portionId: null,
    dishId: null,
    orderId: null,
    bindMode: "specific",
    lock: true,
  };
  emit("command", { type: "q-add", draft });
}
</script>
<template>
  <section class="panel pantry-panel">
    <span class="eyebrow">02 / PREP STATION</span>
    <h2>食材准备 <span class="small">PREP</span></h2>
    <IngredientShelf
      :game="game"
      @restock="
        (ingredient) => emit('command', { type: 'restock', ingredient })
      "
    />
    <div class="prep-actions">
      <div v-for="r in recipeList" :key="r.id" class="recipe-wrap">
        <button
          class="recipe-button"
          :disabled="!!preparationIssue(game, r.id)"
          @click="emit('command', { type: 'prepare', recipe: r.id })"
        >
          <span>{{ r.icon }}</span
          ><b>{{ r.name }}</b
          ><small
            >即时备料 · 可用
            {{ availableStock(game, recipes[r.id].ingredient) }}
            份<template v-if="lockedIngredient(game, recipes[r.id].ingredient)"
              >（锁 {{ lockedIngredient(game, recipes[r.id].ingredient) }}）</template
            ></small
          >
        </button>
        <button class="tiny soft reserve-btn" @click="reservePrep(r.id)">
          🕘 预约备料
        </button>
      </div>
    </div>
    <p class="muted">
      已备 {{ game.portions.length }} / 6 份 · 在灶台选择空闲设备下锅 ·
      预约可提前锁定食材
    </p>
  </section>
</template>
