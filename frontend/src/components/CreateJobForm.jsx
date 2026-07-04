import { useState } from "react";
import { isValidStellarAddress, xlmToStroops } from "../lib/format.js";

// Duration presets keep demo deadlines short enough to also show a refund.
const DURATIONS = [
  { label: "1 hour", secs: 3600 },
  { label: "1 day", secs: 86400 },
  { label: "1 week", secs: 604800 },
];

export default function CreateJobForm({ disabled, pending, onSubmit }) {
  const [worker, setWorker] = useState("");
  const [amount, setAmount] = useState("");
  const [duration, setDuration] = useState(DURATIONS[1].secs);
  const [error, setError] = useState("");

  function submit(e) {
    e.preventDefault();
    setError("");
    try {
      if (!isValidStellarAddress(worker.trim())) {
        throw new Error("Enter a valid worker address (G…).");
      }
      const amountStroops = xlmToStroops(amount);
      const deadline = Math.floor(Date.now() / 1000) + Number(duration);
      onSubmit({ worker: worker.trim(), amountStroops, deadline });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Post a job</h2>
      <p className="muted">
        You escrow XLM now. Release it when the work is done, or refund yourself
        after the deadline.
      </p>

      <label>
        Worker address
        <input
          placeholder="GA…"
          value={worker}
          onChange={(e) => setWorker(e.target.value)}
          disabled={disabled || pending}
          spellCheck={false}
        />
      </label>

      <div className="row">
        <label className="grow">
          Amount (XLM)
          <input
            type="text"
            inputMode="decimal"
            placeholder="10"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={disabled || pending}
          />
        </label>
        <label>
          Deadline
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            disabled={disabled || pending}
          >
            {DURATIONS.map((d) => (
              <option key={d.secs} value={d.secs}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="field-error">{error}</p>}

      <button className="btn primary" type="submit" disabled={disabled || pending}>
        {pending ? "Escrowing…" : disabled ? "Connect wallet to post" : "Escrow & post job"}
      </button>
    </form>
  );
}
