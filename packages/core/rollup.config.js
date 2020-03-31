import typescript from '@rollup/plugin-typescript';

console.log(typescript)

export default {
  input: 'src/index.ts',
  treeshake: true,
  output: {
    dir: 'dist',
    format: 'cjs',
    sourcemap: true,
  },
  plugins: [typescript()]
};
