import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";

const src = resolve("src/styles.css");
const outputs = [resolve("styles.css")];

await Promise.all(outputs.map((dest) => copyFile(src, dest)));
console.log("Copied styles to styles.css");
