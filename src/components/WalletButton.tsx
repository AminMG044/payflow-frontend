"use client";

import { useWallet } from "@/lib/wallet";
import { shortAddress } from "@/lib/format";

export function WalletButton() {
  const { address, connecting, connect, disconnect } = useWallet();

  if (address) {
    return (
      <button
        type="button"
        onClick={() => void disconnect()}
        className="btn-ghost mono"
        title={`${address} — click to disconnect`}
      >
        <span className="h-2 w-2 rounded-full bg-accent" />
        {shortAddress(address, 5)}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void connect()}
      disabled={connecting}
      className="btn-primary"
    >
      {connecting ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
