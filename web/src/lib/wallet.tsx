// Browser wallet connection over EIP-1193 (window.ethereum) with viem.
// Hand-rolled to stay dependency-light: connect, chain enforcement (add/switch
// GIWA Sepolia), and transaction submission with receipt confirmation.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createWalletClient, custom } from "viem";
import type { Account, Address, EIP1193Provider, WalletClient } from "viem";
import { GIWA_CHAIN_ID, giwaChain, publicClient } from "./chain";

/** A viem wallet client bound to the injected provider, GIWA chain and an account. */
export type BrowserSigner = WalletClient<ReturnType<typeof custom>, typeof giwaChain, Account>;

type SendTransactionResult = { hash: `0x${string}`; status: "success" | "reverted" };

type WalletContextValue = {
  address?: Address;
  chainId?: number;
  connecting: boolean;
  installed: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  ensureChain: () => Promise<boolean>;
  /** Raw viem WalletClient over the injected provider (for SDK planners). */
  getSigner: () => Promise<BrowserSigner>;
  sendTransaction: (transaction: {
    to: Address;
    data: `0x${string}`;
    value?: bigint;
  }) => Promise<SendTransactionResult>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

const getEthereum = (): EIP1193Provider | undefined =>
  (window as { ethereum?: EIP1193Provider }).ethereum;

const hexToNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value)) {
    return parseInt(value, 16);
  }
  return undefined;
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<Address | undefined>(undefined);
  const [chainId, setChainId] = useState<number | undefined>(undefined);
  const [connecting, setConnecting] = useState(false);
  const installed = Boolean(getEthereum());

  // Silent restore + event subscription.
  useEffect(() => {
    const ethereum = getEthereum();
    if (!ethereum) return;
    void (async () => {
      try {
        const accounts = (await ethereum.request({
          method: "eth_accounts",
        })) as string[];
        if (accounts[0]) setAddress(accounts[0] as Address);
        const id = hexToNumber(await ethereum.request({ method: "eth_chainId" }));
        if (id !== undefined) setChainId(id);
      } catch {
        // stays disconnected
      }
    })();
    const onAccounts = (accounts: unknown) => {
      const list = accounts as string[];
      setAddress(list[0] as Address | undefined);
    };
    const onChain = (id: unknown) => {
      const parsed = hexToNumber(id);
      if (parsed !== undefined) setChainId(parsed);
    };
    ethereum.on?.("accountsChanged", onAccounts);
    ethereum.on?.("chainChanged", onChain);
    return () => {
      ethereum.removeListener?.("accountsChanged", onAccounts);
      ethereum.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    const ethereum = getEthereum();
    if (!ethereum) throw new Error("No browser wallet found. Install MetaMask.");
    setConnecting(true);
    try {
      const accounts = (await ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (!accounts[0]) throw new Error("Wallet returned no account");
      setAddress(accounts[0] as Address);
      const id = hexToNumber(await ethereum.request({ method: "eth_chainId" }));
      if (id !== undefined) setChainId(id);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(undefined);
  }, []);

  const ensureChain = useCallback(async (): Promise<boolean> => {
    const ethereum = getEthereum();
    if (!ethereum) return false;
    const current = hexToNumber(await ethereum.request({ method: "eth_chainId" }));
    if (current === GIWA_CHAIN_ID) {
      setChainId(current);
      return true;
    }
    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x164ce" }],
      });
      setChainId(GIWA_CHAIN_ID);
      return true;
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 4902 || code === -32603) {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0x164ce",
              chainName: giwaChain.name,
              nativeCurrency: giwaChain.nativeCurrency,
              rpcUrls: [giwaChain.rpcUrls.default.http[0]],
              blockExplorerUrls: [giwaChain.blockExplorers?.default.url],
            },
          ],
        });
        setChainId(GIWA_CHAIN_ID);
        return true;
      }
      throw error;
    }
  }, []);

  const getSigner = useCallback(async (): Promise<BrowserSigner> => {
    const ethereum = getEthereum();
    if (!ethereum) throw new Error("No browser wallet found");
    if (!address) throw new Error("Connect a wallet first");
    await ensureChain();
    return createWalletClient({
      account: address,
      chain: giwaChain,
      transport: custom(ethereum),
    }) as BrowserSigner;
  }, [address, ensureChain]);

  const sendTransaction = useCallback(
    async (transaction: { to: Address; data: `0x${string}`; value?: bigint }) => {
      const walletClient = await getSigner();
      const hash = await walletClient.sendTransaction({
        to: transaction.to,
        data: transaction.data,
        ...(transaction.value !== undefined ? { value: transaction.value } : {}),
      });
      // Receipt confirmation for display; dependent state reads still use the
      // reviewed finalized-head policy, never this receipt's block.
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        retryCount: 0,
        timeout: 180_000,
        pollingInterval: 3_000,
      });
      return { hash, status: receipt.status };
    },
    [getSigner],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      address,
      chainId,
      connecting,
      installed,
      connect,
      disconnect,
      ensureChain,
      getSigner,
      sendTransaction,
    }),
    [address, chainId, connecting, installed, connect, disconnect, ensureChain, getSigner, sendTransaction],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside WalletProvider");
  return context;
}
