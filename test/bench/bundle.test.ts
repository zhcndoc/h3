import { describe, it, expect } from "vitest";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

describe("benchmark", () => {
  it("bundle size", async () => {
    const code = /* js */ `
      // import { H3 } from "../../dist/index.mjs.ts";
      import { H3 } from "../../src/index.ts";
      export default new H3();
    `;

    const bundle = await getBundleSize(code);
    console.log(`Bundle size:${bundle.bytes} (gzip: ${bundle.gzipSize})`);
    expect(bundle.bytes).toBeLessThanOrEqual(12_000); // <12kb
    expect(bundle.gzipSize).toBeLessThanOrEqual(4100); // <4.1kb
  });
});

async function getBundleSize(code: string) {
  const res = await build({
    bundle: true,
    metafile: true,
    write: false,
    minify: true,
    format: "esm",
    platform: "node",
    outfile: "index.mjs",
    treeShaking: true,
    conditions: ["deno"],
    stdin: {
      contents: code,
      resolveDir: fileURLToPath(new URL(".", import.meta.url)),
      sourcefile: "index.mjs",
      loader: "js",
    },
  });

  // await process
  //   .getBuiltinModule("node:fs/promises")
  //   .writeFile("out.mjs", res.outputFiles[0].contents);

  const { bytes } = res.metafile.outputs["index.mjs"];
  const gzipSize = zlib.gzipSync(res.outputFiles[0].text).byteLength;
  return { bytes, gzipSize };
}
