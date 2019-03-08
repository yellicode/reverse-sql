export default {
  input: 'dist/es6/reverse-sql.js', // rollup requires ES input
  output: {
    format: 'umd',
    name: '@yellicode/reverse-sql',
    file: 'dist/bundles/reverse-sql.umd.js'
  },
  external: ['@yellicode/core', '@yellicode/elements', '@yellicode/templating'] // https://github.com/rollup/rollup/wiki/Troubleshooting#treating-module-as-external-dependency
}
