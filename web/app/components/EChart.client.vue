<script setup lang="ts">
import { use } from 'echarts/core'
import { LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, DataZoomComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'
import VChart from 'vue-echarts'

use([LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, DataZoomComponent, SVGRenderer])

defineProps<{ option: EChartsOption; height?: number }>()
const emit = defineEmits<{ click: [params: unknown] }>()
</script>

<template>
  <VChart class="chart" :option="option" :style="{ height: `${height ?? 320}px` }" autoresize :update-options="{ notMerge: true }" @click="emit('click', $event)" />
</template>

<style scoped>
.chart { width: 100%; }
</style>
