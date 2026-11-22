// evaluate-body.mjs <policy.mjs> <pr.json> <body.md>: upstream's evaluatePullRequestContext on the live PR
// object (author, association, labels as fetched) with its body replaced by <body.md>. Prints the JSON verdict.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const [policyPath, prPath, bodyPath] = process.argv.slice(2);
const { evaluatePullRequestContext } = await import(pathToFileURL(policyPath).href);
const pr = JSON.parse(readFileSync(prPath, "utf8"));
const pullRequest = { ...pr, body: readFileSync(bodyPath, "utf8") };
console.log(JSON.stringify(evaluatePullRequestContext({ pullRequest }), null, 2));
