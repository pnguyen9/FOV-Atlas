<script setup lang="ts">
import { routeHref } from '../lib/hashRoute.ts'
</script>

<template>
  <div>
    <h1>Page not found</h1>
    <p>There is no page at this address. <a :href="routeHref({ page: 'home' })">Go to the home page</a>.</p>
  </div>
</template>
