import { config } from "dotenv";
import expand from "dotenv-expand";
import { ethers, providers } from "ethers";
import { Command, Option } from "commander";
import abis from "./abi";

expand(config());

const program = new Command();
program.version("0.0.1");
program
  .option(
    "-c, --contract-name <name>",
    "*Beep* if this string is found in the newly created contract (empty string for all)",
  )
  .addOption(
    new Option("-p, --provider-uri <uri>", "Provider uri (e.g., '/tmp/geth.ipc')").env(
      "PROVIDER_URI",
    ),
  );

program.parse();
const opts = program.opts();

const provider = new providers.IpcProvider(opts.providerUri);

interface NewContractResult {
  name: string | null;
  blockNum: number;
  txHash: string;
}

async function searchContractsInBlock(blockNum: number) {
  const block = await provider.getBlockWithTransactions(blockNum);

  let txRecs = await Promise.all(
    block.transactions.map(async txResp => {
      try {
        return await txResp.wait();
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("transaction failed")) return;
        throw e;
      }
    }),
  );

  const res: NewContractResult[] = [];
  for (const txRec of txRecs) {
    if (txRec && txRec.contractAddress) {
      const contract = new ethers.Contract(txRec.contractAddress, abis.name, provider);
      let name: string | null;
      try {
        name = await contract.name();
      } catch (e) {
        name = null;
      }
      res.push({
        name,
        blockNum,
        txHash: txRec.transactionHash,
      });
    }
  }
  return res;
}

async function processBlock(blockNum: number) {
  const txs = await searchContractsInBlock(blockNum);
  for (const tx of txs) {
    if (tx.name) {
      console.log(`${new Date().toLocaleTimeString()};${Object.values(tx).join(";")}`);
      if (opts.contractName != null && tx.name.toLowerCase().includes(opts.contractName)) {
        console.log(`\u0007Pattern "${opts.contractName}" found in "${tx.name}"`);
      }
    }
  }
}

async function main() {
  console.log("Searcher started ...");
  console.log(`\u0007Current block number: ${await provider.getBlockNumber()}`);
  provider.on("block", processBlock);
}

main().catch(err => {
  console.log(err);
  process.exit(1);
});
