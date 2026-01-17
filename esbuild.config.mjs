import esbuild from "esbuild";

const isProduction = process.argv.includes("--production");
const isWatch = process.argv.includes("--watch");

const options = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*"],
  format: "cjs",
  target: "es2018",
  outfile: "main.js",
  logLevel: "info",
  sourcemap: !isProduction,
  minify: isProduction,
};

if (isWatch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("esbuild is watching...");
} else {
  await esbuild.build(options);
}
