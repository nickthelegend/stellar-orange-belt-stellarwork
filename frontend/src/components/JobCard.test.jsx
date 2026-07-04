import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import JobCard from "./JobCard.jsx";

const CLIENT = "GB2KE2EOJPGASXT3QYVFG2P2VCFYELAPFGZLZFDC5GMWE5XIEJXJ5A5E";
const WORKER = "GAYWGX7XZYB377C4K7S4BWOZ7PEVJ4DQHQNCMEPYAHHHTGZISEKWIIQ4";

function makeJob(overrides = {}) {
  return {
    id: 0,
    client: CLIENT,
    worker: WORKER,
    amount: 100_000_000n, // 10 XLM
    deadline: Math.floor(Date.now() / 1000) + 3600,
    status: "Funded",
    ...overrides,
  };
}

describe("<JobCard />", () => {
  it("renders the amount and an in-escrow pill", () => {
    render(<JobCard job={makeJob()} viewer={null} pending={false} onRelease={() => {}} onRefund={() => {}} />);
    expect(screen.getByText("10 XLM")).toBeInTheDocument();
    expect(screen.getByText("In escrow")).toBeInTheDocument();
  });

  it("lets the funding client release, and fires the callback", () => {
    const onRelease = vi.fn();
    render(<JobCard job={makeJob()} viewer={CLIENT} pending={false} onRelease={onRelease} onRefund={() => {}} />);
    const btn = screen.getByRole("button", { name: /release payment/i });
    fireEvent.click(btn);
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it("disables refund until the deadline has passed", () => {
    render(<JobCard job={makeJob()} viewer={CLIENT} pending={false} onRelease={() => {}} onRefund={() => {}} />);
    expect(screen.getByRole("button", { name: /refund/i })).toBeDisabled();
  });

  it("hides actions for non-clients", () => {
    render(<JobCard job={makeJob()} viewer={WORKER} pending={false} onRelease={() => {}} onRefund={() => {}} />);
    expect(screen.queryByRole("button", { name: /release payment/i })).toBeNull();
    expect(screen.getByText(/only the client can release/i)).toBeInTheDocument();
  });
});
