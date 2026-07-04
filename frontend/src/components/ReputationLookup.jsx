import { useState } from "react";
import { getReputation } from "../lib/soroban.js";
import { isValidStellarAddress, mapContractError, shortenAddress, stroopsToXlm } from "../lib/format.js";

// Reads a worker's score straight from the *reputation* contract — a different
// contract than the escrow, proving the two are independent yet composed.
export default function ReputationLookup({ presetAddress }) {
  const [addr, setAddr] = useState(presetAddress || "");
  const [rep, setRep] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function lookup(e) {
    e?.preventDefault();
    setError("");
    setRep(null);
    if (!isValidStellarAddress(addr.trim())) {
      setError("Enter a valid address (G…).");
      return;
    }
    setLoading(true);
    try {
      setRep(await getReputation(addr.trim()));
    } catch (err) {
      setError(mapContractError(err, "reputation"));
    } finally {
      setLoading(false);
    }
  }

  const score = rep ? rep.completed - rep.disputed : 0;

  return (
    <section className="card rep">
      <h2>Reputation lookup</h2>
      <form className="row" onSubmit={lookup}>
        <input
          className="grow"
          placeholder="Worker address G…"
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          spellCheck={false}
        />
        <button className="btn primary sm" disabled={loading}>
          {loading ? "…" : "Look up"}
        </button>
      </form>

      {error && <p className="field-error">{error}</p>}

      {rep && (
        <div className="rep-result">
          <div className="rep-addr muted">{shortenAddress(addr, 6, 6)}</div>
          <div className="rep-grid">
            <div className="rep-stat">
              <span className="num ok">{rep.completed}</span>
              <span className="lbl">Completed</span>
            </div>
            <div className="rep-stat">
              <span className="num bad">{rep.disputed}</span>
              <span className="lbl">Disputed</span>
            </div>
            <div className="rep-stat">
              <span className="num">{stroopsToXlm(rep.volume)}</span>
              <span className="lbl">XLM settled</span>
            </div>
            <div className="rep-stat">
              <span className={`num ${score >= 0 ? "ok" : "bad"}`}>{score}</span>
              <span className="lbl">Net score</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
