import { useWallet } from "../lib/wallet";
import { GIWA_CHAIN_ID, explorerAddress } from "../lib/chain";
import { shortAddress } from "../lib/format";
import { Badge, Button } from "./ui";

export function WalletButton() {
  const wallet = useWallet();

  if (!wallet.installed) {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noreferrer"
        className="rounded-xl border border-amber-800 bg-amber-950/60 px-4 py-2 text-sm text-amber-300"
      >
        Install MetaMask
      </a>
    );
  }

  if (!wallet.address) {
    return (
      <Button onClick={() => void wallet.connect()} loading={wallet.connecting}>
        Connect wallet
      </Button>
    );
  }

  const wrongChain = wallet.chainId !== undefined && wallet.chainId !== GIWA_CHAIN_ID;
  return (
    <div className="flex items-center gap-2">
      {wrongChain ? (
        <button
          type="button"
          onClick={() => void wallet.ensureChain()}
          className="rounded-full border border-amber-700 bg-amber-950 px-2.5 py-0.5 text-xs text-amber-300 hover:bg-amber-900"
        >
          Switch to GIWA Sepolia
        </button>
      ) : (
        <Badge tone="green">GIWA Sepolia</Badge>
      )}
      <a
        href={explorerAddress(wallet.address)}
        target="_blank"
        rel="noreferrer"
        className="mono rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-500"
      >
        {shortAddress(wallet.address)}
      </a>
      <Button variant="ghost" onClick={wallet.disconnect}>
        Exit
      </Button>
    </div>
  );
}
