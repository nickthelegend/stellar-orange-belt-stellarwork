import { describe, it, expect } from "vitest";
import {
  xlmToStroops,
  stroopsToXlm,
  shortenAddress,
  isValidStellarAddress,
  parseStatus,
  mapContractError,
} from "./format.js";

describe("xlmToStroops", () => {
  it("converts whole XLM", () => {
    expect(xlmToStroops("10")).toBe(100_000_000n);
  });
  it("converts fractional XLM to stroops", () => {
    expect(xlmToStroops("10.5")).toBe(105_000_000n);
    expect(xlmToStroops("0.0000001")).toBe(1n);
  });
  it("rejects zero and negatives and junk", () => {
    expect(() => xlmToStroops("0")).toThrow();
    expect(() => xlmToStroops("-5")).toThrow();
    expect(() => xlmToStroops("abc")).toThrow();
    expect(() => xlmToStroops("1.123456789")).toThrow(); // > 7 decimals
  });
});

describe("stroopsToXlm", () => {
  it("formats stroops back to XLM, trimming zeros", () => {
    expect(stroopsToXlm(100_000_000n)).toBe("10");
    expect(stroopsToXlm(105_000_000n)).toBe("10.5");
    expect(stroopsToXlm("1")).toBe("0.0000001");
  });
  it("round-trips with xlmToStroops", () => {
    for (const v of ["1", "0.5", "123.4567", "0.0000001"]) {
      expect(stroopsToXlm(xlmToStroops(v))).toBe(v);
    }
  });
});

describe("shortenAddress", () => {
  it("abbreviates long addresses", () => {
    const a = "GB2KE2EOJPGASXT3QYVFG2P2VCFYELAPFGZLZFDC5GMWE5XIEJXJ5A5E";
    expect(shortenAddress(a)).toBe(`${a.slice(0, 4)}…${a.slice(-4)}`);
    expect(shortenAddress(a, 6, 6)).toBe(`${a.slice(0, 6)}…${a.slice(-6)}`);
  });
  it("returns short strings unchanged", () => {
    expect(shortenAddress("abc")).toBe("abc");
    expect(shortenAddress("")).toBe("");
  });
});

describe("isValidStellarAddress", () => {
  it("accepts a valid public key", () => {
    expect(isValidStellarAddress("GB2KE2EOJPGASXT3QYVFG2P2VCFYELAPFGZLZFDC5GMWE5XIEJXJ5A5E")).toBe(true);
  });
  it("accepts a valid contract id", () => {
    expect(isValidStellarAddress("CCIYGH3XJKOZAXNN7BIXK73MZE7TL5AP6BAX4WAGUM36NXAKF252MKBS")).toBe(true);
  });
  it("rejects garbage", () => {
    expect(isValidStellarAddress("not-an-address")).toBe(false);
    expect(isValidStellarAddress("")).toBe(false);
  });
});

describe("parseStatus", () => {
  it("flattens the array-encoded enum from scValToNative", () => {
    expect(parseStatus(["Funded"])).toBe("funded");
    expect(parseStatus(["Released"])).toBe("released");
  });
  it("handles plain strings and tagged objects", () => {
    expect(parseStatus("Refunded")).toBe("refunded");
    expect(parseStatus({ tag: "Funded" })).toBe("funded");
  });
});

describe("mapContractError", () => {
  it("maps escrow error codes to friendly text", () => {
    expect(mapContractError("Error(Contract, #5)")).toMatch(/already released or refunded/i);
    expect(mapContractError("Error(Contract, #6)")).toMatch(/after the deadline/i);
  });
  it("maps reputation error codes when kind=reputation", () => {
    expect(mapContractError("Error(Contract, #1)", "reputation")).toMatch(/authorized escrow/i);
  });
  it("detects wallet rejection", () => {
    expect(mapContractError("User declined the request")).toMatch(/rejected the request/i);
  });
  it("passes through short unknown messages", () => {
    expect(mapContractError("boom")).toBe("boom");
  });
});
