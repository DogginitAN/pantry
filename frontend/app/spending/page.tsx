"use client";

import { useState, useEffect } from "react";
import { BarChart3 } from "lucide-react";
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

// Sage/terra color sequence for category bars
const CHART_COLORS = [
  "bg-sage-500",   // primary
  "bg-terra-500",  // secondary
  "bg-sage-300",   // tertiary
  "bg-terra-300",  // quaternary
  "bg-sage-400",
  "bg-terra-400",
  "bg-sage-200",
  "bg-terra-200",
];

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
  const currentMonthRow = tableRows[tableRows.length - 1];
  const currentMonthTotal = currentMonthRow?.total ?? 0;
  const currentMonthReceipts = currentMonthRow?.receipt_count ?? 0;
  const budgetAmount = budget?.monthly_budget;
  const budgetPct =
    budgetAmount != null && budgetAmount > 0
      ? Math.min((currentMonthTotal / budgetAmount) * 100, 100)
      : 0;
  const overBudget = budgetAmount != null && currentMonthTotal > budgetAmount;
  const budgetRemaining =
    budgetAmount != null ? budgetAmount - currentMonthTotal : null;

  const topCategory =
    categories && categories.length > 0 ? categories[0].category : null;

  const maxCategory =
    categories && categories.length > 0 ? categories[0].total : 0;

  // Empty state: no data at all
  const hasNoData =
    !monthlyError &&
    !categoriesError &&
    monthly !== null &&
    categories !== null &&
    monthly.every((m) => m.total === 0) &&
    categories.length === 0;

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

  if (hasNoData) {
    return (
      <div className="p-6">
        <h1 className="font-heading text-2xl text-warm-900 mb-8">Spending Analytics</h1>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-full bg-sage-50 flex items-center justify-center mb-5">
            <BarChart3 className="w-10 h-10 text-sage-400" strokeWidth={1.25} />
          </div>
          <h2 className="font-heading text-xl text-warm-700 mb-2">No spending data yet</h2>
          <p className="text-warm-500 text-sm max-w-xs">
            Start scanning your grocery receipts and your spending breakdown will appear here — by category, month, and top items.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <h1 className="font-heading text-2xl text-warm-900">Spending Analytics</h1>

      {/* 1. Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* This Month */}
        <div className="bg-white rounded-2xl border border-linen p-6 shadow-card">
          <p className="text-warm-500 text-sm mb-1">This Month</p>
          <p className="font-heading text-2xl text-warm-800">
            ${currentMonthTotal.toFixed(2)}
          </p>
          <p className="text-warm-400 text-xs mt-1">{currentMonthReceipts} receipts</p>
        </div>

        {/* Top Category */}
        <div className="bg-white rounded-2xl border border-linen p-6 shadow-card">
          <p className="text-warm-500 text-sm mb-1">Top Category</p>
          <p className="font-heading text-2xl text-warm-900">
            {topCategory ?? "—"}
          </p>
          {topCategory && categories && categories[0] && (
            <p className="text-warm-400 text-xs mt-1">
              ${categories[0].total.toFixed(2)}
            </p>
          )}
        </div>

        {/* Budget Remaining */}
        <div className="bg-white rounded-2xl border border-linen p-6 shadow-card">
          <p className="text-warm-500 text-sm mb-1">Budget Remaining</p>
          {budgetError || budgetAmount == null ? (
            <p className="font-heading text-2xl text-warm-400">Not set</p>
          ) : (
            <p
              className={`font-heading text-2xl ${
                overBudget ? "text-terra-600" : "text-sage-600"
              }`}
            >
              {overBudget ? "-" : ""}${Math.abs(budgetRemaining ?? 0).toFixed(2)}
            </p>
          )}
          {budgetAmount != null && (
            <p className="text-warm-400 text-xs mt-1">of ${budgetAmount.toFixed(2)} budget</p>
          )}
        </div>

        {/* Months Tracked */}
        <div className="bg-white rounded-2xl border border-linen p-6 shadow-card">
          <p className="text-warm-500 text-sm mb-1">Months Tracked</p>
          <p className="font-heading text-2xl text-warm-900">
            {monthly ? monthly.filter((m) => m.total > 0).length : 0}
          </p>
          <p className="text-warm-400 text-xs mt-1">with purchases</p>
        </div>
      </div>

      {/* 2. Budget Bar */}
      <section className="bg-white rounded-2xl border border-linen p-6 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-lg text-warm-800">Monthly Budget</h2>
          {!budgetError && (
            <div className="flex items-center gap-1 text-sm text-warm-500">
              <span className="text-warm-800 font-medium">
                ${currentMonthTotal.toFixed(2)}
              </span>
              <span>/</span>
              {editingBudget ? (
                <input
                  type="number"
                  className="w-24 bg-warm-50 border border-warm-300 rounded-lg px-2 py-0.5 text-warm-800 text-sm"
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
                  className="text-sage-500 hover:text-sage-600 underline"
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
          <p className="text-xs text-warm-400">Failed to load budget</p>
        ) : budgetAmount == null ? (
          <div className="w-full bg-warm-100 rounded-full h-3">
            <div className="bg-warm-300 h-3 rounded-full" style={{ width: "0%" }} />
          </div>
        ) : (
          <>
            <div className="w-full bg-warm-100 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-300 ${
                  overBudget ? "bg-terra-500" : "bg-sage-500"
                }`}
                style={{ width: `${budgetPct}%` }}
              />
            </div>
            {overBudget && (
              <p className="text-xs text-terra-600 mt-2">
                Over budget by ${(currentMonthTotal - budgetAmount).toFixed(2)}
              </p>
            )}
          </>
        )}
      </section>

      {/* 3. Monthly Trend Table */}
      <section className="bg-white rounded-2xl border border-linen p-6 shadow-card">
        <h2 className="font-heading text-lg text-warm-800 mb-4">Monthly Trend</h2>
        {monthlyError ? (
          <p className="text-xs text-warm-400">Failed to load</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-warm-500 text-left border-b border-linen">
                  <th className="py-2 pr-4 font-medium whitespace-nowrap">Month</th>
                  <th className="py-2 pr-4 font-medium whitespace-nowrap">Receipts</th>
                  <th className="py-2 font-medium whitespace-nowrap">Total</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr
                    key={row.month}
                    className={`border-b border-linen/60 ${
                      row.month === currentMonthKey ? "bg-sage-50" : ""
                    }`}
                  >
                    <td className="py-2 pr-4 text-warm-700 whitespace-nowrap">
                      {formatMonth(row.month)}
                      {row.month === currentMonthKey && (
                        <span className="ml-2 text-xs text-sage-500 font-medium">current</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-warm-600 whitespace-nowrap">{row.receipt_count}</td>
                    <td className="py-2 text-warm-800 font-medium whitespace-nowrap">${row.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 4. Category Breakdown */}
      <section className="bg-white rounded-2xl border border-linen p-6 shadow-card">
        <h2 className="font-heading text-lg text-warm-800 mb-4">By Category</h2>
        {categoriesError ? (
          <p className="text-xs text-warm-400">Failed to load</p>
        ) : categories && categories.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <BarChart3 className="w-10 h-10 text-warm-300 mb-3" strokeWidth={1.25} />
            <p className="text-warm-500 text-sm">No category data yet — scan a receipt to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(categories ?? []).map((cat, i) => {
              const pct = maxCategory > 0 ? (cat.total / maxCategory) * 100 : 0;
              const colorClass = CHART_COLORS[i % CHART_COLORS.length];
              return (
                <div key={cat.category} className="flex items-center gap-3">
                  <span className="w-28 text-warm-600 text-sm truncate shrink-0">
                    {cat.category}
                  </span>
                  <div className="flex-1 bg-warm-100 rounded-full h-2.5">
                    <div
                      className={`${colorClass} h-2.5 rounded-full min-w-[1.5rem]`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-20 text-right text-sm text-warm-800 font-medium shrink-0">
                    ${cat.total.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. Top Items Table */}
      <section className="bg-white rounded-2xl border border-linen p-6 shadow-card">
        <h2 className="font-heading text-lg text-warm-800 mb-4">Top Items</h2>
        {topItemsError ? (
          <p className="text-xs text-warm-400">Failed to load</p>
        ) : (
          <div className="max-h-64 overflow-x-auto overflow-y-auto rounded-xl border border-linen">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="text-warm-500 text-left border-b border-linen">
                  <th className="py-2 px-3 font-medium whitespace-nowrap">Product</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap">Category</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap">Total Spent</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap"># Purchases</th>
                </tr>
              </thead>
              <tbody>
                {(topItems ?? []).map((item, i) => (
                  <tr key={i} className="border-b border-linen/60 hover:bg-warm-50">
                    <td className="py-2 px-3 text-warm-800 whitespace-nowrap">{item.canonical_name}</td>
                    <td className="py-2 px-3 text-warm-600 whitespace-nowrap">{item.category}</td>
                    <td className="py-2 px-3 text-warm-800 font-medium whitespace-nowrap">
                      ${item.total_spend.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-warm-600 whitespace-nowrap">{item.purchase_count}</td>
                  </tr>
                ))}
                {(topItems ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-warm-400 text-sm">
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
