import { createPublicClient, http, getAddress } from "viem";
import { sepolia } from "viem/chains";
import { payrollAbi } from "../src/abi.ts";

const rpc = process.env.RPC_URL!;
const client = createPublicClient({ chain: sepolia, transport: http(rpc) });

const getters = [
  { type: "function", name: "getPayrollInterval", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getLastPayrollTimestamp", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getReservedPayrollCycles", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getAllEmployees", inputs: [], outputs: [{ type: "tuple[]", components: [{ name: "employeeAddress", type: "address" }, { name: "salary", type: "uint256" }] }], stateMutability: "view" },
] as const;

const candidates = [
  ["memoire / prod ", "0xA15fBb6884b64A93B453628abd9b181D434D206A"],
  ["memoire / demo ", "0x68B5Fc5B4B57dFBEE5d295BA25da36790aA68340"],
  ["README  / prod ", "0xF9D4069037bAa86E9a145d7d2CaF3feD4528F096"],
  ["README  / demo ", "0x30cc1644fe776f95CFBf7c62c68cC69e1BDeE5E8"],
];

const block = await client.getBlock();
console.log("bloc courant :", block.number, "timestamp", block.timestamp, "\n");

for (const [label, raw] of candidates) {
  const address = getAddress(raw);
  const code = await client.getCode({ address });
  if (!code || code === "0x") {
    console.log(`${label} ${address}  AUCUN CODE A CETTE ADRESSE`);
    continue;
  }
  const read = async (name: string) => {
    try {
      return await client.readContract({ address, abi: getters, functionName: name as never });
    } catch (e) {
      return `illisible (${(e as Error).message.split("\n")[0]})`;
    }
  };
  const interval = await read("getPayrollInterval");
  const last = await read("getLastPayrollTimestamp");
  const cycles = await read("getReservedPayrollCycles");
  const employees = await read("getAllEmployees");
  console.log(`${label} ${address}`);
  console.log(`    code ${(code.length - 2) / 2} octets | intervalle ${interval} s | cycles reserves ${cycles}`);
  console.log(`    dernier runPayroll : ${last} | salaries enregistres : ${Array.isArray(employees) ? employees.length : employees}`);

  // eth_call en lecture seule : aucune transaction n'est diffusee
  try {
    await client.simulateContract({
      address,
      abi: payrollAbi,
      functionName: "runPayroll",
      account: "0x000000000000000000000000000000000000dEaD",
    });
    console.log("    simulation runPayroll : PASSE (le contrat executerait la paie)");
  } catch (e) {
    const err = e as { walk?: (f: (c: unknown) => boolean) => unknown };
    let name = "non decode";
    let args: unknown;
    const found = err.walk?.((c: any) => c?.name === "ContractFunctionRevertedError") as any;
    if (found?.data) {
      name = found.data.errorName;
      args = found.data.args;
    }
    console.log(`    simulation runPayroll : revert ${name}${args ? " " + JSON.stringify(args, (_k, v) => typeof v === "bigint" ? v.toString() : v) : ""}`);
  }
  console.log();
}
