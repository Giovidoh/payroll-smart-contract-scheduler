import { createPublicClient, http, getAddress, formatUnits, formatEther } from "viem";
import { sepolia } from "viem/chains";
import { payrollAbi } from "../src/abi.ts";

const client = createPublicClient({ chain: sepolia, transport: http(process.env.RPC_URL!) });
const address = getAddress("0x68B5Fc5B4B57dFBEE5d295BA25da36790aA68340");

const getters = [
  { type: "function", name: "getPayrollInterval", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getLastPayrollTimestamp", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

const interval = await client.readContract({ address, abi: getters, functionName: "getPayrollInterval" });
const last = await client.readContract({ address, abi: getters, functionName: "getLastPayrollTimestamp" });
console.log("Contrat de demonstration", address);
console.log("  intervalle         :", interval, "s");
console.log("  dernier runPayroll :", last, new Date(Number(last) * 1000).toISOString(), "\n");

// Blocs connus des deux executions, releves via l'API Etherscan.
for (const block of [11749660n, 11749663n]) {
  const done = await client.getContractEvents({
    address, abi: payrollAbi, eventName: "PayrollCompleted", fromBlock: block, toBlock: block,
  });
  const paid = await client.getContractEvents({
    address, abi: payrollAbi, eventName: "SalaryPaid", fromBlock: block, toBlock: block,
  });

  for (const e of done) {
    const a = e.args as Record<string, bigint>;
    const r = await client.getTransactionReceipt({ hash: e.transactionHash! });
    const cost = r.gasUsed * r.effectiveGasPrice;
    console.log(`Bloc ${block}  tx ${e.transactionHash}`);
    console.log(`  PayrollCompleted : ${a.numberOfEmployeesPaid} salaries, ${formatUnits(a.totalAmountPaid, 6)} mUSDC`);
    for (const p of paid) {
      const pa = p.args as Record<string, unknown>;
      console.log(`    SalaryPaid -> ${pa.employee}  ${formatUnits(pa.salary as bigint, 6)} mUSDC`);
    }
    console.log(`  gas utilise ${r.gasUsed} | prix effectif ${r.effectiveGasPrice} wei | cout ${formatEther(cost)} ETH`);
    console.log(`  cout par salarie paye : ${Number(r.gasUsed) / Number(a.numberOfEmployeesPaid)} gas\n`);
  }
}
