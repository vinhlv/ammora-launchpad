// Generate a fresh throwaway testnet wallet.
//
//   npm run new-wallet
//
// The key is generated locally from crypto.getRandomValues and printed once.
// It is never written to disk, never committed, and never sent anywhere.
// Use it ONLY on testnets: paste it into .env (AMMORA_PRIVATE_KEY) for the CLI
// or import it into a fresh MetaMask profile for the web UI, and fund it from
// the GIWA Sepolia faucet.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

console.log("Fresh testnet wallet (throwaway — testnets only, never reuse):");
console.log("");
console.log(`  address:     ${account.address}`);
console.log(`  private key: ${privateKey}`);
console.log("");
console.log("Next steps:");
console.log("  1. Fund it with testnet ETH + WETH from a GIWA Sepolia faucet.");
console.log("  2. CLI: put the key in .env as AMMORA_PRIVATE_KEY (never commit).");
console.log("  3. Web UI: import the key into a new MetaMask account/profile.");
console.log("  4. Keep your real wallets out of this project entirely.");
