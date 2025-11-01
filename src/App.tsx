import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Legend, Tooltip as RTooltip
} from "recharts";

type Risk = "Conservative" | "Moderate" | "Aggressive" | "Moderate-Aggressive";

interface Inputs {
  budget: number;
  horizon: number;
  risk: Risk;
  regionSplit: string; // "60|40" USA|India
  currency: "USD" | "INR";
  includeGold: boolean;
  includeCrypto: boolean;
  cryptoCapPct: number;
  rebalFreq: "Quarterly" | "Annual";
}

interface AllocationRow {
  assetClass: string;
  instrument: string;
  country: string;
  pct: number;
  expCagr: [number, number];
  risk: "Low" | "Medium" | "High" | "Very High";
  rationale: string;
}

function clamp(min: number, v: number, max: number) { return Math.max(min, Math.min(max, v)); }
function fmtPct(n: number) { return `${n.toFixed(1)}%`; }

function autoAllocate(i: Inputs): AllocationRow[] {
  const profiles = {
    Conservative: { equity: 35, fixed: 45, gold: 12, reits: 4, cash: 4, crypto: 0 },
    Moderate: { equity: 60, fixed: 25, gold: 8, reits: 5, cash: 2, crypto: 0 },
    "Moderate-Aggressive": { equity: 70, fixed: 15, gold: 7, reits: 5, cash: 1, crypto: 2 },
    Aggressive: { equity: 80, fixed: 8, gold: 5, reits: 5, cash: 0, crypto: 2 },
  } as const;

  const base: any = { ...profiles[i.risk] };
  if (i.horizon >= 10) { base.equity += 5; base.fixed -= 5; }
  else if (i.horizon <= 3) { base.equity -= 10; base.fixed += 10; }

  if (!i.includeGold) { base.fixed += base.gold; base.gold = 0; }
  if (!i.includeCrypto) { base.equity += base.crypto; base.crypto = 0; }
  if (i.includeCrypto && base.crypto > i.cryptoCapPct) {
    const diff = base.crypto - i.cryptoCapPct;
    base.equity += diff; base.crypto = i.cryptoCapPct;
  }

  const sum = base.equity + base.fixed + base.gold + base.reits + base.cash + (base.crypto || 0);
  for (const k of Object.keys(base)) base[k] = (base[k] / sum) * 100;

  const [usaPct, indPct] = i.regionSplit.split("|").map(parseFloat);

  const sectorTiltUSA = [
    { name: "Broad Market", pct: 55, instr: "S&P 500 ETF (VOO)" },
    { name: "Technology/AI", pct: 20, instr: "Nasdaq 100 (QQQ)" },
    { name: "Healthcare", pct: 10, instr: "Healthcare ETF (XLV)" },
    { name: "Energy", pct: 8, instr: "Energy ETF (XLE)" },
    { name: "Industrials", pct: 7, instr: "Industrials ETF (XLI)" },
  ];
  const sectorTiltIND = [
    { name: "Broad Market", pct: 55, instr: "Nifty 50 ETF" },
    { name: "Midcap Growth", pct: 20, instr: "Nifty Midcap 150" },
    { name: "Financials", pct: 10, instr: "Bank Nifty ETF" },
    { name: "Manufacturing/Infra", pct: 10, instr: "CPSE/Infra ETF" },
    { name: "Export-Tech", pct: 5, instr: "IT Services ETF" },
  ];

  const rows: AllocationRow[] = [];
  const push = (
    assetClass: string,
    instrument: string,
    country: string,
    pct: number,
    expCagr: [number, number],
    risk: AllocationRow["risk"],
    rationale: string
  ) => rows.push({ assetClass, instrument, country, pct, expCagr, risk, rationale });

  const equityUSA = (base.equity * usaPct) / 100;
  const equityIND = (base.equity * indPct) / 100;

  sectorTiltUSA.forEach((s) => {
    const pct = (equityUSA * s.pct) / 100;
    const exp: [number, number] = s.name === "Technology/AI" ? [9, 12] : [7, 10];
    const risk: AllocationRow["risk"] = s.name === "Technology/AI" ? "High" : "Medium";
    push("Equity", s.instr, "USA", pct, exp, risk, `Sector tilt: ${s.name}`);
  });
  sectorTiltIND.forEach((s) => {
    const pct = (equityIND * s.pct) / 100;
    const exp: [number, number] = s.name.includes("Midcap") ? [11, 14] : [8, 12];
    const risk: AllocationRow["risk"] = s.name.includes("Midcap") ? "High" : "Medium";
    push("Equity", s.instr, "India", pct, exp, risk, `Sector tilt: ${s.name}`);
  });

  const fixedUSA = (base.fixed * usaPct) / 100;
  const fixedIND = (base.fixed * indPct) / 100;
  if (fixedUSA > 0) push("Fixed Income", "UST Bills/Notes Ladder (T-Bills, 2-5y Notes)", "USA", fixedUSA, [3.5, 5], "Low", "Income & drawdown buffer");
  if (fixedIND > 0) push("Fixed Income", "India G-Secs/SDL Ladder (T-Bills, 5-10y)", "India", fixedIND, [6, 7.5], "Low", "Carry + rate diversification");

  if (base.gold > 0) {
    const goldUSA = (base.gold * usaPct) / 100;
    const goldIND = (base.gold * indPct) / 100;
    if (goldUSA > 0) push("Commodity", "Gold ETF (GLD/IAU)", "Global", goldUSA, [4.5, 6], "Low", "Inflation & crisis hedge");
    if (goldIND > 0) push("Commodity", "India Gold ETF/SGB", "India", goldIND, [4.5, 6], "Low", "Local currency hedge");
  }

  const reitsUSA = (base.reits * usaPct) / 100;
  const reitsIND = (base.reits * indPct) / 100;
  if (reitsUSA > 0) push("REITs", "U.S. REIT ETF (VNQ)", "USA", reitsUSA, [5, 7], "Medium", "Income + diversification");
  if (reitsIND > 0) push("REITs", "India REIT/InvIT", "India", reitsIND, [6, 8], "Medium", "Infra & real-asset exposure");

  const cashUSA = (base.cash * usaPct) / 100;
  const cashIND = (base.cash * indPct) / 100;
  if (cashUSA > 0) push("Cash", "USD MMF / T-Bill ETF (BIL/SGOV)", "USA", cashUSA, [3, 4], "Low", "Dry powder for dips");
  if (cashIND > 0) push("Cash", "INR Liquid Fund / T-Bill", "India", cashIND, [5, 6], "Low", "Liquidity buffer");

  if (i.includeCrypto && base.crypto > 0) {
    const c = base.crypto;
    push("Crypto", "BTC/ETH Spot ETF Blend", "Global", c, [12, 20], "Very High", "Speculative convexity with cap");
  }

  const cleaned: AllocationRow[] = [];
  let tiny = 0;
  rows.forEach((r) => { if (r.pct < 0.4) tiny += r.pct; else cleaned.push(r); });
  if (tiny > 0) cleaned.push({ assetClass: "Cash", instrument: "Consolidated", country: "Global", pct: tiny, expCagr: [0, 0], risk: "Low", rationale: "Rounded tiny slices" });

  cleaned.sort((a, b) => b.pct - a.pct);
  return cleaned;
}

export default function App() {
  const [inputs, setInputs] = useState<Inputs>({
    budget: 25000,
    horizon: 7,
    risk: "Moderate",
    regionSplit: "60|40",
    currency: "USD",
    includeGold: true, // fix TS strict boolean inference
    includeCrypto: false,
    cryptoCapPct: 3,
    rebalFreq: "Annual",
  } as any);

  // Quick fix for boolean literals in a string-env
  (inputs as any).includeGold = inputs.includeGold === true || inputs.includeGold === true;
  (inputs as any).includeCrypto = inputs.includeCrypto === true || inputs.includeCrypto === true;

  const rows = useMemo(() => autoAllocate(inputs), [inputs]);

  const totalInvest = inputs.budget;
  const pieByAsset = useMemo(() => {
    const by = new Map<string, number>();
    rows.forEach((r) => by.set(r.assetClass, (by.get(r.assetClass) || 0) + r.pct));
    return Array.from(by.entries()).map(([name, value]) => ({ name, value }));
  }, [rows]);

  const pieByRegion = useMemo(() => {
    const by = new Map<string, number>();
    rows.forEach((r) => by.set(r.country, (by.get(r.country) || 0) + r.pct));
    return Array.from(by.entries()).map(([name, value]) => ({ name, value }));
  }, [rows]);

  const barExpReturns = useMemo(() =>
    rows.slice(0, 8).map((r) => ({
      name: r.instrument.length > 18 ? r.instrument.slice(0, 18) + "…" : r.instrument,
      low: r.expCagr[0],
      high: r.expCagr[1],
    })),
  [rows]);

  const COLORS = ["#748FFC", "#63E6BE", "#FFD43B", "#FF8787", "#91A7FF", "#FFC078", "#B197FC", "#66D9E8", "#A9E34B", "#FF922B"];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <motion.h1 initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="text-3xl md:text-4xl font-semibold tracking-tight mb-6">
          Global Investment Simulator
        </motion.h1>

        {/* Controls */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur p-4 md:p-6">
          <h2 className="text-lg font-semibold mb-4">Inputs</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Budget (USD)</label>
              <input
                type="number"
                min={100}
                step={100}
                value={inputs.budget}
                onChange={(e) => setInputs(s => ({ ...s, budget: clamp(100, Number(e.target.value || 0), 10000000) }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Time Horizon (years)</label>
              <input
                type="number"
                min={1}
                max={30}
                value={inputs.horizon}
                onChange={(e) => setInputs(s => ({ ...s, horizon: clamp(1, Number(e.target.value || 0), 30) }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Risk Profile</label>
              <select
                value={inputs.risk}
                onChange={(e) => setInputs(s => ({ ...s, risk: e.target.value as Risk }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
              >
                <option>Conservative</option>
                <option>Moderate</option>
                <option>Moderate-Aggressive</option>
                <option>Aggressive</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Region Split (USA | India)</label>
              <select
                value={inputs.regionSplit}
                onChange={(e) => setInputs(s => ({ ...s, regionSplit: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
              >
                <option value="80|20">80% USA | 20% India</option>
                <option value="70|30">70% USA | 30% India</option>
                <option value="60|40">60% USA | 40% India</option>
                <option value="50|50">50% USA | 50% India</option>
                <option value="40|60">40% USA | 60% India</option>
                <option value="30|70">30% USA | 70% India</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Currency</label>
              <select
                value={inputs.currency}
                onChange={(e) => setInputs(s => ({ ...s, currency: e.target.value as "USD" | "INR" }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
              >
                <option value="USD">USD</option>
                <option value="INR">INR</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <input
                id="gold"
                type="checkbox"
                checked={!!inputs.includeGold}
                onChange={(e) => setInputs(s => ({ ...s, includeGold: e.target.checked }))}
              />
              <label htmlFor="gold" className="text-sm text-slate-300">Include Gold</label>
            </div>
            <div className="flex items-center gap-3">
              <input
                id="crypto"
                type="checkbox"
                checked={!!inputs.includeCrypto}
                onChange={(e) => setInputs(s => ({ ...s, includeCrypto: e.target.checked }))}
              />
              <label htmlFor="crypto" className="text-sm text-slate-300">Include Crypto</label>
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Crypto Max Cap (%)</label>
              <input
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={inputs.cryptoCapPct}
                onChange={(e) => setInputs(s => ({ ...s, cryptoCapPct: clamp(0, Number(e.target.value || 0), 10) }))}
                disabled={!inputs.includeCrypto}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Rebalancing</label>
              <select
                value={inputs.rebalFreq}
                onChange={(e) => setInputs(s => ({ ...s, rebalFreq: e.target.value as "Quarterly" | "Annual" }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
              >
                <option>Quarterly</option>
                <option>Annual</option>
              </select>
            </div>
          </div>
        </div>

        {/* Summary & Metrics */}
        <div className="grid gap-6 mt-6 md:grid-cols-3">
          <div className="md:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur">
            <div className="p-4 border-b border-slate-800">
              <h3 className="font-semibold">Optimized Portfolio</h3>
            </div>
            <div className="overflow-x-auto p-4">
              <table className="w-full text-sm">
                <thead className="text-slate-300">
                  <tr className="border-b border-slate-800">
                    <th className="text-left py-2 pr-4">Asset Class</th>
                    <th className="text-left py-2 pr-4">Instrument</th>
                    <th className="text-left py-2 pr-4">Country</th>
                    <th className="text-right py-2 pr-4">Allocation</th>
                    <th className="text-right py-2 pr-4">Exp. CAGR</th>
                    <th className="text-left py-2 pr-4">Risk</th>
                    <th className="text-left py-2">Rationale</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={idx} className="border-b border-slate-800/70 hover:bg-slate-800/30">
                      <td className="py-2 pr-4">{r.assetClass}</td>
                      <td className="py-2 pr-4">{r.instrument}</td>
                      <td className="py-2 pr-4">{r.country}</td>
                      <td className="py-2 pr-4 text-right font-medium">{fmtPct(r.pct)}</td>
                      <td className="py-2 pr-4 text-right">{r.expCagr[0]}–{r.expCagr[1]}%</td>
                      <td className="py-2 pr-4">{r.risk}</td>
                      <td className="py-2">{r.rationale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur p-4 text-sm space-y-2">
            <div className="flex justify-between"><span>Total Investment</span><span className="font-semibold">${totalInvest.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Risk Profile</span><span className="font-semibold">{inputs.risk}</span></div>
            <div className="flex justify-between"><span>Horizon</span><span className="font-semibold">{inputs.horizon} yrs</span></div>
            <div className="flex justify-between"><span>Rebalancing</span><span className="font-semibold">{inputs.rebalFreq}</span></div>
            <p className="text-slate-400 pt-2">Expected portfolio CAGR is heuristic only.</p>
            <button
              className="w-full mt-2 bg-slate-100 text-slate-900 rounded-lg py-2 font-medium hover:bg-white"
              onClick={() => {
                const headers = ["Asset Class","Instrument","Country","Allocation %","Exp CAGR Low","Exp CAGR High","Risk","Rationale"];
                const lines = rows.map(r => [r.assetClass, r.instrument, r.country, r.pct.toFixed(2), r.expCagr[0], r.expCagr[1], r.risk, r.rationale].map(x => `"${String(x).replaceAll('"','\\"')}"`).join(","));
                const csv = [headers.join(","), ...lines].join("\\n");
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'portfolio_allocation.csv'; a.click();
                URL.revokeObjectURL(url);
              }}
            >Download CSV</button>
          </div>
        </div>

        {/* Charts */}
        <div className="grid gap-6 mt-6 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur">
            <div className="p-4 border-b border-slate-800"><h3 className="font-semibold">Allocation by Asset Class</h3></div>
            <div className="h-72 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieByAsset} dataKey="value" nameKey="name" outerRadius={100} label>
                    {pieByAsset.map((_, i) => (<Cell key={i} />))}
                  </Pie>
                  <RTooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur">
            <div className="p-4 border-b border-slate-800"><h3 className="font-semibold">Allocation by Region</h3></div>
            <div className="h-72 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieByRegion} dataKey="value" nameKey="name" outerRadius={100} label>
                    {pieByRegion.map((_, i) => (<Cell key={i} />))}
                  </Pie>
                  <RTooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur">
            <div className="p-4 border-b border-slate-800"><h3 className="font-semibold">Expected Return Ranges (Top Holdings)</h3></div>
            <div className="h-72 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barExpReturns}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-15} textAnchor="end" height={60} />
                  <YAxis />
                  <RTooltip />
                  <Legend />
                  <Bar dataKey="low" name="Low" />
                  <Bar dataKey="high" name="High" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Stress-test cards */}
        <div className="grid gap-6 mt-6 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur p-4 text-sm space-y-2">
            <h3 className="font-semibold mb-2">Stress Test: Recession</h3>
            <p>• Impact: EPS declines; equities -15% to -35%; rates down → bonds rise.</p>
            <p>• Adjust: Shift 10–15% to T-Bills + Gold; tilt to Healthcare/Staples.</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur p-4 text-sm space-y-2">
            <h3 className="font-semibold mb-2">Stress Test: High Inflation</h3>
            <p>• Impact: Long-duration bonds pressured; commodities rally.</p>
            <p>• Adjust: +10% commodities; shorten duration; maintain quality value.</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur p-4 text-sm space-y-2">
            <h3 className="font-semibold mb-2">Stress Test: USD Strength</h3>
            <p>• Impact: INR assets face FX drag; USD assets outperform in USD terms.</p>
            <p>• Adjust: Raise U.S. ETF weight; hedge INR exposure; prefer exporters.</p>
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <button
            className="px-4 py-2 rounded-lg bg-slate-100 text-slate-900 font-medium hover:bg-white"
            onClick={() => setInputs({
              budget: 25000,
              horizon: 7,
              risk: "Moderate",
              regionSplit: "60|40",
              currency: "USD",
              includeGold: true,
              includeCrypto: false,
              cryptoCapPct: 3,
              rebalFreq: "Annual",
            })}
          >
            Reset
          </button>
          <button
            className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            Back to Top
          </button>
        </div>

        <p className="text-xs text-slate-500 mt-6">Educational tool only — not financial advice.</p>
      </div>
    </div>
  );
}