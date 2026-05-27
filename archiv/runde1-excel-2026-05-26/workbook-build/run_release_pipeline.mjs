import { runReleasePipeline } from "./src/releasePipeline.mjs";

const report = await runReleasePipeline();

console.log(JSON.stringify(report, null, 2));
