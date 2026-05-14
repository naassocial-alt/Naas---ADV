import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['build/**/*']
  },
  firebaseRulesPlugin.configs['flat/recommended']
];
