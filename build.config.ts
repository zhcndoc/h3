import { rm } from "node:fs/promises";
import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  declaration: true,
  rollup: {
    esbuild: {
      target: "ES2022",
      tsconfigRaw: {
        compilerOptions: {
          useDefineForClassFields: false,
        },
      },
    },
  },
  hooks: {
    async "build:done"() {
      await rm("dist/index.d.ts");
    },
  },
});
