import pluginVue from 'eslint-plugin-vue'
import pluginSecurity from 'eslint-plugin-security'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'

export default defineConfigWithVueTs(
  { ignores: ['dist/**', 'coverage/**', 'docs/mockup/**', 'node_modules/**'] },
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.strictTypeChecked,
  pluginSecurity.configs.recommended,
  {
    rules: {
      // Rendering goes through reactive state and templates, never raw HTML.
      'vue/no-v-html': 'error',
      'vue/no-v-text-v-html-on-component': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-properties': [
        'error',
        { object: 'document', property: 'write', message: 'Render through Vue templates.' },
        { object: 'document', property: 'querySelector', message: 'Render through Vue templates.' },
        { object: 'document', property: 'querySelectorAll', message: 'Render through Vue templates.' },
        { property: 'innerHTML', message: 'Render through Vue templates.' },
        { property: 'outerHTML', message: 'Render through Vue templates.' },
        { property: 'insertAdjacentHTML', message: 'Render through Vue templates.' },
      ],
      'id-length': ['error', { min: 2, exceptions: ['_'] }],
    },
  },
)
