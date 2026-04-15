<template>
  <div class="container py-20">
    <UiCard padded>
      <div class="text-center">
        <h2 class="mb-2 text-2xl font-semibold">{{ $t('not_found.title') }}</h2>
        <p class="text-muted-foreground">{{ $t('not_found.description') }}</p>
      </div>
    </UiCard>
  </div>
</template>

<script lang="ts" setup>
import UiCard from '@/components/ui/Card.vue';
</script>
