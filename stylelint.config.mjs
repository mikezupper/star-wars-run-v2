// CSS guardrail: a website, so the floor is Baseline *newly* available. Anything newer goes
// inside @supports, with a page that still works without it.
/** @type {import('stylelint').Config} */
export default {
  plugins: ['stylelint-plugin-use-baseline'],
  rules: {
    'plugin/use-baseline': [true, { available: 'newly' }],
  },
  ignoreFiles: ['**/node_modules/**', 'dist/**', '.sample/**', 'coverage/**'],
};
