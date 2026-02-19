"use client";

import { useState, useEffect } from "react";
import {
  getMonthlySpending,
  getCategorySpending,
  getTopItems,
  getBudget,
  setBudget,
  MonthlySpend,
  CategorySpend,
  TopItem,
  BudgetSettings,
} from "@/lib/api";

function getLastNMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

function formatMonth(m: string): string {
  const [year, month] = m.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleString("default", { month: "short", year: "numeric" });
}

export default function SpendingPage() {
  const [monthly, setMonthly] = useState<MonthlySpend[] | null>(null);
  const [monthlyError, setMonthlyError] = useState(false);

  const [categories, setCategories] = useState<CategorySpend[] | null>(null);
  const [categoriesError, setCategoriesError] = useState(false);

  const [topItems, setTopItems] = useState<TopItem[] | null>(null);
  const [topItemsError, setTopItemsError] = useState(false);

  const [budget, setBudgetState] = useState<BudgetSettings | null>(null);
  const [budgetError, setBudgetError] = useState(false);

  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");

  useEffect(() => {
    Promise.allSettled([
      getMonthlySpending(),
      getCategorySpending(),
      getTopItems(),
      getBudget(),
    ]).then(([monthlyResult, categoriesResult, topItemsResult, budgetResult]) => {
      if (monthlyResult.status === "fulfilled") {
        setMonthly(monthlyResult.value);
      } else {
        setMonthlyError(true);
      }

      if (categoriesResult.status === "fulfilled") {
        setCategories(categoriesResult.value);
      } else {
        setCategoriesError(true);
      }

      if (topItemsResult.status === "fulfilled") {
        setTopItems(topItemsResult.value);
      } else {
        setTopItemsError(true);
      }

      if (budgetResult.status === "fulfilled") {
        setBudgetState(budgetResult.value);
        setBudgetInput(String(budgetResult.value.monthly_budget ?? ""));
      } else {
        setBudgetError(true);
      }
    });
  }, []);

  // Build 6-month table with missing months filled in
  const last6 = getLastNMonths(6);
  const monthMap = new Map((monthly ?? []).map((m) => [m.month, m]));
  const tableRows = last6.map(
    (m) => monthMap.get(m) ?? { month: m, total: 0, receipt_count: 0 }
  );

  const currentMonthKey = last6[last6.length - 1];
  const currentMonthTotal = tableRows[tableRows.length - 1]?.total ?? 0;
  const budgetAmount = budget?.monthly_budget;
  const budgetPct =
    budgetAmount != null && budgetAmount > 0
      ? Math.min((currentMonthTotal / budgetAmount) * 100, 100)
      : 0;
  const overBudget = budgetAmount != null && currentMonthTotal > budgetAmount;

  async function handleBudgetSave() {
    const trimmed = budgetInput.trim();
    const newBudget = trimmed === "" ? null : Number(trimmed);
    if (trimmed !== "" && isNaN(newBudget as number)) {
      setEditingBudget(false);
      return;
    }
    try {
      const result = await setBudget(newBudget);
      setBudgetState(result);
      setBudgetInput(String(result.monthly_budget ?? ""));
    } catch {
      // ignore save errors
    }
    setEditingBudget(false);
  }

  // Category bars: highest category (sorted DESC by API) = ~100% width
  const maxCategory =
    categories && categories.length > 0 ? categories[0].total : 0;

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold text-zinc-100">Spending Analytics</h1>

      {/* 1. Budget Bar */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-zinc-200">Monthly Budget</h2>
          {!budgetError && (
            <div className="flex items-center gap-1 text-sm text-zinc-400">
              <span className="font-mono text-zinc-200">
                ${currentMonthTotal.toFixed(2)}
              </span>
              <span>/</span>
              {editingBudget ? (
                <input
                  type="number"
                  className="w-24 bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5 text-zinc-100 text-sm font-mono"
                  value={budgetInput}
                  autoFocus
                  onChange={(e) => setBudgetInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleBudgetSave();
                    if (e.key === "Escape") {
                      setBudgetInput(String(budget?.monthly_budget ?? ""));
                      setEditingBudget(false);
                    }
                  }}
                />
              ) : (
                <button
                  className="text-emerald-400 hover:text-emerald-300 underline"
                  onClick={() => setEditingBudget(true)}
                >
                  {budgetAmount != null
                    ? `$${budgetAmount.toFixed(2)}`
                    : "Set budget"}
                </button>
              )}
            </div>
          )}
        </div>
        {budgetError ? (
          <p className="text-xs text-zinc-500">Failed to load</p>
        ) : (
          <div className="w-full bg-zinc-700 rounded h-4">
            <div
              className={`h-4 rounded transition-all duration-300 ${
                overBudget ? "bg-red-500" : "bg-emerald-500"
              }`}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
        )}
      </section>

      {/* 2. Monthly Trend Table */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-200 mb-3">Monthly Trend</h2>
        {monthlyError ? (
          <p className="text-xs text-zinc-500">Failed to load</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-400 text-left border-b border-zinc-700">
                  <th className="py-2 pr-4 font-medium whitespace-nowrap">Month</th>
                  <th className="py-2 pr-4 font-medium whitespace-nowrap">Receipts</th>
                  <th className="py-2 font-medium whitespace-nowrap">Total</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr
                    key={row.month}
                    className={`border-b border-zinc-800 ${
                      row.month === currentMonthKey ? "bg-zinc-700" : ""
                    }`}
                  >
                    <td className="py-2 pr-4 text-zinc-200 whitespace-nowrap">{formatMonth(row.month)}</td>
                    <td className="py-2 pr-4 text-zinc-300 whitespace-nowrap">{row.receipt_count}</td>
                    <td className="py-2 text-zinc-100 font-mono whitespace-nowrap">${row.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 3. Category Breakdown */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-200 mb-3">By Category</h2>
        {categoriesError ? (
          <p className="text-xs text-zinc-500">Failed to load</p>
        ) : categories && categories.length === 0 ? (
          <p className="text-sm text-zinc-500">No category data yet.</p>
        ) : (
          <div className="space-y-2">
            {(categories ?? []).map((cat) => {
              const pct = maxCategory > 0 ? (cat.total / maxCategory) * 100 : 0;
              return (
                <div key={cat.category} className="flex items-center gap-3">
                  <span className="w-32 text-sm text-zinc-300 truncate shrink-0">
                    {cat.category}
                  </span>
                  <div className="flex-1 bg-zinc-600 rounded h-3">
                    <div
                      className="bg-emerald-500 h-3 rounded"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-20 text-right text-sm text-zinc-200 font-mono shrink-0">
                    ${cat.total.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Top Items Table */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-200 mb-3">Top Items</h2>
        {topItemsError ? (
          <p className="text-xs text-zinc-500">Failed to load</p>
        ) : (
          <div className="max-h-64 overflow-x-auto overflow-y-auto rounded border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-zinc-900 z-10">
                <tr className="text-zinc-400 text-left border-b border-zinc-700">
                  <th className="py-2 px-3 font-medium whitespace-nowrap">Product</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap">Category</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap">Total Spent</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap"># Purchases</th>
                </tr>
              </thead>
              <tbody>
                {(topItems ?? []).map((item, i) => (
                  <tr key={i} className="border-b border-zinc-800 hover:bg-zinc-800/40">
                    <td className="py-2 px-3 text-zinc-200 whitespace-nowrap">{item.canonical_name}</td>
                    <td className="py-2 px-3 text-zinc-400 whitespace-nowrap">{item.category}</td>
                    <td className="py-2 px-3 text-zinc-100 font-mono whitespace-nowrap">
                      ${item.total_spend.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-zinc-300 whitespace-nowrap">{item.purchase_count}</td>
                  </tr>
                ))}
                {(topItems ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-zinc-500 text-sm">
                      No purchase data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
