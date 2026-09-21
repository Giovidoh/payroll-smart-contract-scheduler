import { readFileSync } from "node:fs";
import { toFunctionSelector, toEventSelector } from "viem";
import { payrollAbi, ERROR_HANDLING } from "../src/abi.ts";

const artifact = JSON.parse(
  readFileSync(
    "//wsl.localhost/Ubuntu/home/gidoh/projects/payroll-smart-contract/out/Payroll.sol/Payroll.json",
    "utf8",
  ),
);

const sig = (i) => `${i.name}(${i.inputs.map((x) => x.type).join(",")})`;

const onchain = new Map();
for (const item of artifact.abi) {
  if (item.type === "function" || item.type === "error" || item.type === "event") {
    onchain.set(`${item.type}:${sig(item)}`, item);
  }
}

let ok = true;
console.log("Fragment ordonnanceur  ->  contrat compile\n");
for (const item of payrollAbi) {
  const key = `${item.type}:${sig(item)}`;
  const found = onchain.has(key);
  if (!found) ok = false;
  const selector =
    item.type === "event" ? toEventSelector(sig(item)) : toFunctionSelector(sig(item));
  console.log(
    `  ${found ? "OK   " : "ABSENT"} ${item.type.padEnd(8)} ${sig(item).padEnd(62)} ${selector.slice(0, 10)}`,
  );
}

console.log("\nTable ERROR_HANDLING :");
for (const name of Object.keys(ERROR_HANDLING)) {
  const match = [...onchain.keys()].some((k) => k.startsWith(`error:${name}(`));
  if (!match) ok = false;
  console.log(`  ${match ? "OK   " : "ABSENT"} ${name} -> ${ERROR_HANDLING[name]}`);
}

console.log(
  "\nErreurs du contrat NON couvertes par ERROR_HANDLING (traitees en UNEXPECTED_REVERT) :",
);
for (const [k, item] of onchain) {
  if (k.startsWith("error:") && !(item.name in ERROR_HANDLING)) {
    console.log(`  - ${item.name}`);
  }
}

console.log(`\nRESULTAT : ${ok ? "toutes les signatures concordent" : "DIVERGENCE"}`);
process.exitCode = ok ? 0 : 1;
