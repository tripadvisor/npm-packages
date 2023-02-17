import nodeResolve from "@rollup/plugin-node-resolve";
import { babel } from "@rollup/plugin-babel";
import { terser } from "rollup-plugin-terser";

export default {
  input: ["read-file.ts", "throttled.ts", "read-file.test.ts", "benchmark.ts"],
  external: ["node:test", /node_modules/],
  plugins: [
    nodeResolve({
      extensions: [".ts"],
      preferBuiltins: true,
    }),
    babel({
      presets: ["@babel/preset-typescript"],
      extensions: [".ts"],
      skipPreflightCheck: true,
      babelHelpers: "bundled",
    }),
    terser({
      mangle: {
        keep_classnames: true,
      },
    }),
  ],
  output: {
    dir: "dist",
    format: "es",
    sourcemap: true,
  },
  preserveSymlinks: true,
};
