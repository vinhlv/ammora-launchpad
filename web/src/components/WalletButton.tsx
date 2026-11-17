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
        className="wallet-install"
      >
        Install wallet
      </a>
    );
  }

  if (!wallet.address) {
    return (
      <Button onClick={() => void wallet.connect()} loading={wallet.connecting}>
        Connect
      </Button>
    );
  }

  const wrongChain = wallet.chainId !== undefined && wallet.chainId !== GIWA_CHAIN_ID;
  return (
    <div className="wallet-menu">
      {wrongChain ? (
        <button
          type="button"
          onClick={() => void wallet.ensureChain()}
          className="wallet-network wallet-network--warning"
        >
          Switch network
        </button>
      ) : (
        <Badge tone="green">GIWA</Badge>
      )}
      <a
        href={explorerAddress(wallet.address)}
        target="_blank"
        rel="noreferrer"
        className="wallet-address mono"
      >
        {shortAddress(wallet.address)}
      </a>
      <Button variant="ghost" onClick={wallet.disconnect}>
        Exit
      </Button>
    </div>
  );
}
