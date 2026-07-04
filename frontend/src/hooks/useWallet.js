import { useCallback, useEffect, useState } from "react";
import {
  connect as walletConnect,
  getConnectedAddress,
  getWalletNetwork,
  hasFreighter,
  signTransaction,
} from "../lib/wallet.js";
import { getXlmBalance } from "../lib/soroban.js";

// Encapsulates wallet connection, network detection and balance loading so the
// rest of the app can stay declarative.
export function useWallet() {
  const [address, setAddress] = useState(null);
  const [network, setNetwork] = useState(null);
  const [balance, setBalance] = useState(null);
  const [installed, setInstalled] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const refreshBalance = useCallback(async (addr) => {
    const who = addr || address;
    if (!who) return;
    try {
      setBalance(await getXlmBalance(who));
    } catch {
      setBalance(null);
    }
  }, [address]);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      if (!(await hasFreighter())) {
        setInstalled(false);
        throw new Error("Freighter wallet not detected. Install it to continue.");
      }
      const addr = await walletConnect();
      setAddress(addr);
      setNetwork(await getWalletNetwork());
      await refreshBalance(addr);
      return addr;
    } finally {
      setConnecting(false);
    }
  }, [refreshBalance]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setBalance(null);
    setNetwork(null);
  }, []);

  // Reconnect silently on load if the user already authorized this origin.
  useEffect(() => {
    (async () => {
      if (!(await hasFreighter())) {
        setInstalled(false);
        return;
      }
      const addr = await getConnectedAddress();
      if (addr) {
        setAddress(addr);
        setNetwork(await getWalletNetwork());
        refreshBalance(addr);
      }
    })();
    // Runs once on mount to restore an existing wallet session.
  }, []);

  const onTestnet = !network || /test/i.test(network);

  return {
    address,
    network,
    balance,
    installed,
    connecting,
    onTestnet,
    connect,
    disconnect,
    refreshBalance,
    signTransaction,
  };
}
