import pluginVue from 'eslint-plugin-vue'
import pluginSecurity from 'eslint-plugin-security'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'

// Rendering goes through reactive state and templates, never raw HTML or DOM lookups.
const domRestriction = (property) => ({ property, message: 'Render through Vue templates.' })

export default defineConfigWithVueTs(
  { ignores: ['dist/**', 'coverage/**', 'docs/mockup/**'] },
  pluginVue.configs['flat/recommended-error'],
  vueTsConfigs.strictTypeChecked,
  pluginSecurity.configs.recommended,
  {
    rules: {
      'no-eval': 'error',
      'no-restricted-properties': [
        'error',
        { object: 'document', property: 'write', message: 'Render through Vue templates.' },
        ...[
          'innerHTML',
          'outerHTML',
          'insertAdjacentHTML',
          'querySelector',
          'querySelectorAll',
          'getElementById',
          'getElementsByClassName',
          'getElementsByTagName',
        ].map(domRestriction),
      ],
      'id-length': ['error', { min: 2, exceptions: ['_'] }],
    },
  },
)
