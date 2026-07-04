import { NETWORK } from "../config.js";
import { shortenAddress } from "../lib/format.js";

export default function Header({ wallet }) {
  const { address, balance, connecting, connect, disconnect, installed, onTestnet } = wallet;

  return (
    <header className="header">
      <div className="brand">
        <span className="logo" aria-hidden>◈</span>
        <div>
          <h1>StellarWork</h1>
          <p className="tagline">Escrowed jobs with on-chain reputation</p>
        </div>
      </div>

      <div className="wallet">
        {address ? (
          <div className="wallet-connected">
            <div className="wallet-meta">
              <a
                className="addr"
                href={NETWORK.explorerAccount(address)}
                target="_blank"
                rel="noreferrer"
                title={address}
              >
                {shortenAddress(address, 6, 6)}
              </a>
              <span className="bal">
                {balance == null ? "—" : `${Number(balance).toFixed(2)} XLM`}
              </span>
            </div>
            <button className="btn ghost sm" onClick={disconnect}>
              Disconnect
            </button>
          </div>
        ) : (
          <button className="btn primary" onClick={connect} disabled={connecting}>
            {connecting ? "Connecting…" : "Connect Freighter"}
          </button>
        )}
      </div>

      {!installed && (
        <div className="banner warn">
          Freighter not detected.{" "}
          <a href="https://www.freighter.app/" target="_blank" rel="noreferrer">
            Install the wallet
          </a>{" "}
          and refresh.
        </div>
      )}
      {address && !onTestnet && (
        <div className="banner warn">
          Your wallet is not on Testnet. Switch Freighter’s network to Testnet to transact.
        </div>
      )}
    </header>
  );
}
