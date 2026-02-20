"use client";

import { useState, useEffect, useRef } from "react";
import { BarChart3 } from "lucide-react";
import { EmptyState } from "@/components/ui";
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

// ─── Monthly Bar Chart ────────────────────────────────────────────────────────

function MonthlyBarChart({ rows, currentMonthKey }: {
  rows: { month: string; total: number; receipt_count: number }[];
  currentMonthKey: string;
}) {
  const max = Math.max(...rows.map((r) => r.total ?? 0), 1);
  return (
    <div className="flex items-end justify-between gap-2 h-40 pt-6">
      {rows.map((row) => {
        const pct = ((row.total ?? 0) / max) * 100;
        const isCurrent = row.month === currentMonthKey;
        return (
          <div key={row.month} className="flex flex-col items-center gap-1 flex-1 min-w-0">
            {/* Dollar label above bar */}
            <span className="text-xs text-warm-600 font-medium whitespace-nowrap">
              {(row.total ?? 0) > 0 ? `$${(row.total ?? 0).toFixed(0)}` : ""}
            </span>
            {/* Bar */}
            <div className="w-full flex items-end" style={{ height: "88px" }}>
              <div
                className={`w-full rounded-t-lg transition-all duration-300 ${
                  isCurrent ? "bg-sage-600" : "bg-sage-300"
                }`}
                style={{ height: `${Math.max(pct, (row.total ?? 0) > 0 ? 4 : 0)}%` }}
              />
            </div>
            {/* Month label */}
            <span className={`text-xs truncate text-center w-full ${isCurrent ? "text-sage-700 font-semibold" : "text-warm-500"}`}>
              {formatMonth(row.month).split(" ")[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function SpendingPage() {
  const [loading, setLoading] = useState(true);
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
      setLoading(false);
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
  const budgetAmount = budget?.monthly_budget; // persisted value — used only for the edit-button label
  // Live value: follows budgetInput while editing so bar updates on every keystroke/stepper click
  const liveBudgetAmount: number | null = (() => {
    if (editingBudget && budgetInput.trim() !== "") {
      const parsed = Number(budgetInput);
      return !isNaN(parsed) && parsed > 0 ? parsed : null;
    }
    return budgetAmount ?? null;
  })();
  const budgetPct =
    liveBudgetAmount != null && liveBudgetAmount > 0
      ? Math.min((currentMonthTotal / liveBudgetAmount) * 100, 100)
      : 0;
  const overBudget = liveBudgetAmount != null && currentMonthTotal > liveBudgetAmount;
  const budgetRemaining =
    liveBudgetAmount != null ? liveBudgetAmount - currentMonthTotal : null;

  const daysRemaining = (() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
  })();

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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced auto-save: fires 500ms after budgetInput changes while editing
  useEffect(() => {
    if (!editingBudget) return;
    const trimmed = budgetInput.trim();
    const newBudget = trimmed === "" ? null : Number(trimmed);
    if (trimmed !== "" && isNaN(newBudget as number)) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await setBudget(newBudget);
        setBudgetState(result);
      } catch {
        // ignore save errors
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [budgetInput, editingBudget]);

  async function handleBudgetSave() {
    // Flush any pending debounced save immediately
    if (debounceRef.current) clearTimeout(debounceRef.current);
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

  if (loading) {
    return (
      <div className="p-6 space-y-8 animate-fade-in-up">
        <h1 className="font-heading text-2xl text-warm-900">Spending</h1>
        {/* Stat card skeletons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="bg-white rounded-2xl border border-linen p-6 shadow-card">
              <div className="h-4 w-20 bg-warm-200 rounded-lg animate-pulse mb-3" />
              <div className="h-8 w-16 bg-warm-200 rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
        {/* Budget skeleton */}
        <div className="bg-white rounded-2xl border border-linen p-6 shadow-card">
          <div className="h-4 w-32 bg-warm-200 rounded-lg animate-pulse mb-4" />
          <div className="h-3 w-full bg-warm-200 rounded-full animate-pulse" />
        </div>
        {/* Chart skeletons */}
        {[1, 2].map((n) => (
          <div key={n} className="bg-white rounded-2xl border border-linen p-6 shadow-card">
            <div className="h-4 w-28 bg-warm-200 rounded-lg animate-pulse mb-4" />
            <div className="space-y-3">
              {[1, 2, 3].map((m) => (
                <div key={m} className="h-4 bg-warm-200 rounded-lg animate-pulse" style={{ width: `${80 - m * 15}%` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (hasNoData) {
    return (
      <div className="p-6 animate-fade-in-up">
        <h1 className="font-heading text-2xl text-warm-900 mb-8">Spending</h1>
        <EmptyState
          icon={BarChart3}
          heading="No spending data yet"
          subtext="Start scanning your grocery receipts and your spending breakdown will appear here — by category, month, and top items."
          action={{ label: "Scan Receipt", href: "/receipts" }}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 animate-fade-in-up">
      <div>
        <h1 className="font-heading text-2xl text-warm-900 mb-1">Spending</h1>
        <p className="text-warm-500 text-sm">Track your grocery spending over time.</p>
      </div>

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
              ${(categories[0].total ?? 0).toFixed(2)}
            </p>
          )}
        </div>

        {/* Budget Remaining */}
        <div className="bg-white rounded-2xl border border-linen p-6 shadow-card">
          <p className="text-warm-500 text-sm mb-1">Budget Remaining</p>
          {budgetError || liveBudgetAmount == null ? (
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
          {liveBudgetAmount != null && (
            <p className="text-warm-400 text-xs mt-1">of ${liveBudgetAmount.toFixed(2)} budget</p>
          )}
        </div>

        {/* Months Tracked */}
        <div className="bg-white rounded-2xl border border-linen p-6 shadow-card">
          <p className="text-warm-500 text-sm mb-1">Months Tracked</p>
          <p className="font-heading text-2xl text-warm-900">
            {monthly ? monthly.filter((m) => m.total > 0).length : 0}
          </p>
        </div>
      </div>

      {/* 2. Budget Bar */}
      <section className="bg-white rounded-2xl border border-linen p-6 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-heading text-lg text-warm-800">Monthly Budget</h2>
            <p className="text-warm-500 text-xs mt-0.5">
              {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} remaining
            </p>
          </div>
          {!budgetError && (
            <div className="flex items-center gap-1 text-sm text-warm-500">
              <span className="text-warm-800 font-medium">
                ${currentMonthTotal.toFixed(2)}
              </span>
              <span>/</span>
              {editingBudget ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setBudgetInput(String(Math.max(0, (Number(budgetInput) || 0) - 100)))}
                    className="w-6 h-6 rounded-full bg-sage-100 hover:bg-sage-200 text-sage-700 text-sm font-bold flex items-center justify-center transition-colors"
                    tabIndex={-1}
                  >−</button>
                  <input
                    type="number"
                    className="w-20 bg-warm-50 border border-warm-300 rounded-lg px-2 py-0.5 text-warm-800 text-sm text-center"
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
                  <button
                    type="button"
                    onClick={() => setBudgetInput(String((Number(budgetInput) || 0) + 100))}
                    className="w-6 h-6 rounded-full bg-sage-100 hover:bg-sage-200 text-sage-700 text-sm font-bold flex items-center justify-center transition-colors"
                    tabIndex={-1}
                  >+</button>
                </div>
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
          <div className="w-full bg-sage-100 rounded-full h-3">
            <div className="bg-warm-300 h-3 rounded-full" style={{ width: "0%" }} />
          </div>
        ) : (
          <>
            <div className="w-full bg-sage-100 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-300 ${
                  budgetPct >= 90 ? "bg-red-600" :
                  budgetPct >= 70 ? "bg-amber-500" :
                  "bg-sage-600"
                }`}
                style={{ width: `${budgetPct}%` }}
              />
            </div>
            {overBudget && liveBudgetAmount != null && (
              <p className="text-xs text-terra-600 mt-2">
                Over budget by ${(currentMonthTotal - liveBudgetAmount).toFixed(2)}
              </p>
            )}
          </>
        )}
      </section>

      {/* 3. Monthly Trend */}
      <section className="bg-white rounded-2xl border border-linen p-6 shadow-card">
        <h2 className="font-heading text-lg text-warm-800 mb-4">Monthly Trend</h2>
        {monthlyError ? (
          <p className="text-xs text-warm-400">Failed to load</p>
        ) : (
          <MonthlyBarChart rows={tableRows} currentMonthKey={currentMonthKey} />
        )}
        {!monthlyError && (
          <div className="overflow-x-auto mt-6 border-t border-linen pt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-warm-500 text-left border-b border-linen">
                  <th className="py-2 pr-4 font-medium whitespace-nowrap">Month</th>
                  <th className="py-2 pr-4 font-medium whitespace-nowrap">Receipts</th>
                  <th className="py-2 font-medium whitespace-nowrap">Total</th>
                </tr>
              </thead>
              <tbody>
                {[...tableRows].reverse().map((row) => (
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
                    <td className="py-2 text-warm-800 font-medium whitespace-nowrap">${(row.total ?? 0).toFixed(2)}</td>
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
          <EmptyState
            compact
            icon={BarChart3}
            heading="No category data yet"
            subtext="Scan a receipt to get started."
          />
        ) : (
          <div className="space-y-3">
            {(categories ?? []).map((cat) => {
              const pct = maxCategory > 0 ? (cat.total / maxCategory) * 100 : 0;
              return (
                <div key={cat.category} className="flex items-center gap-3">
                  <span className="w-28 text-warm-600 text-sm truncate shrink-0">
                    {cat.category}
                  </span>
                  <div className="flex-1 bg-sage-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-sage-600 h-2.5 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-20 text-right text-sm text-warm-800 font-medium shrink-0">
                    ${(cat.total ?? 0).toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. Top Items Table */}
      <section className="bg-white rounded-2xl border border-linen p-6 shadow-card">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-heading text-lg text-warm-800">Top Items</h2>
          <span className="text-xs text-warm-400">Showing top 10 items</span>
        </div>
        {topItemsError ? (
          <p className="text-xs text-warm-400">Failed to load</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-linen">
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
                {(topItems ?? []).slice(0, 10).map((item, i) => (
                  <tr key={i} className="border-b border-linen/60 hover:bg-warm-50">
                    <td className="py-2 px-3 text-warm-800 whitespace-nowrap">{item.canonical_name}</td>
                    <td className="py-2 px-3 text-warm-600 whitespace-nowrap">{item.category}</td>
                    <td className="py-2 px-3 text-warm-800 font-medium whitespace-nowrap">
                      ${(item.total_spend ?? 0).toFixed(2)}
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
