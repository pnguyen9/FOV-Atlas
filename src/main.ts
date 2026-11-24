import { createApp } from 'vue'
import App from './App.vue'
import { isFramed } from './lib/framing'

createApp(App, { framed: isFramed(window) }).mount('#app')
