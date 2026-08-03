module.exports = {
  extends: ['@commitlint/config-conventional'],
  parserPreset: {
    parserOpts: {
      headerPattern: /^(?:\[[^\]]+\]\s*)*(feat|fix|perf|revert|docs|style|refactor|test|build|ci|chore)(?:\(([^)]+)\))?:\s(.+)$/,
      headerCorrespondence: ['type', 'scope', 'subject'],
    },
  },
};
