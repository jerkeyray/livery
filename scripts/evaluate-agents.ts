import { evaluateAgentCases, loadAgentEvalAdapter } from "../tests/agent-eval/harness.js";

const adapterFlag = process.argv.indexOf("--adapter");
const adapterPath = adapterFlag >= 0 ? process.argv[adapterFlag + 1] : undefined;
if (adapterFlag >= 0 && !adapterPath) throw new Error("Pass a module path after --adapter.");
const adapter = adapterPath ? await loadAgentEvalAdapter(adapterPath) : undefined;
const report = await evaluateAgentCases(adapter);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
