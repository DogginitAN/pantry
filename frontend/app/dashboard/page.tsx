"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const BASE_URL = "http://localhost:8060/api";

interface InventoryItem {
  id: number;
  name: string;
  category: string | null;
  status: "stocked" | "low" | "out";
  days_since_last_purchase: number | null;
  avg_interval_days: number | null;
  predicted_out_date: string | null;
}

interface Stats {
  total: number;
  stocked: number;
  low: number;
  out: number;
}

async function fetchInventory(): Promise<InventoryItem[]> {
  const res = await fetch(`${BASE_URL}/inventory`);
  if (!res.ok) throw new Error(`Inventory fetch failed: ${res.status}`);
  return res.json();
}

async function fetchLowInventory(): Promise<InventoryItem[]> {
  const res = await fetch(`${BASE_URL}/inventory/low`);
  if (!res.ok) throw new Error(`Low inventory fetch failed: ${res.status}`);
  return res.json();
}

function computeStats(items: InventoryItem[]): Stats {
  return {
    total: items.length,
    stocked: items.filter((i) => i.status === "stocked").length,
    low: items.filter((i) => i.status === "low").length,
    out: items.filter((i) => i.status === "out").length,
  };
}

function formatPredictedDate(dateStr: string | null): string {
  if (!dateStr) return "Unknown";
  const d = new Date(dateStr);
  const today = new Date();
  const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "Overdue";
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return `In ${diffDays} days`;
}

function StatCard({
  label,
  value,
  colorClass,
  loading,
}: {
  label: string;
  value: number;
  colorClass: string;
  loading: boolean;
}) {
  return (
    <div className="bg-zinc-900 rounded-xl p-5 flex flex-col gap-1 border border-zinc-800">
      <span className="text-zinc-400 text-sm font-medium">{label}</span>
      {loading ? (
        <div className="h-8 w-16 bg-zinc-800 rounded animate-pulse mt-1" />
      ) : (
        <span className={`text-3xl font-bold ${colorClass}`}>{value}</span>
      )}
    </div>
  );
}

function AlertCard({ item }: { item: InventoryItem }) {
  const isOut = item.status === "out";
  const borderColor = isOut ? "border-red-800" : "border-amber-800";
  const badgeColor = isOut
    ? "bg-red-900 text-red-300"
    : "bg-amber-900 text-amber-300";
  const badgeLabel = isOut ? "Out of Stock" : "Running Low";

  return (
    <div className={`bg-zinc-900 rounded-xl p-4 border ${borderColor}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-zinc-100 font-medium truncate">{item.name}</p>
          <p className="text-zinc-500 text-xs mt-0.5">{item.category ?? "Uncategorized"}</p>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${badgeColor}`}>
          {badgeLabel}
        </span>
      </div>
      <div className="mt-3 flex gap-4 text-xs text-zinc-400">
        <span>
          Last bought:{" "}
          <span className="text-zinc-300">
            {item.days_since_last_purchase != null
              ? `${item.days_since_last_purchase}d ago`
              : "Never"}
          </span>
        </span>
        <span>
          Est. out:{" "}
          <span className={isOut ? "text-red-400" : "text-amber-400"}>
            {formatPredictedDate(item.predicted_out_date)}
          </span>
        </span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ total: 0, stocked: 0, low: 0, out: 0 });
  const [lowItems, setLowItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchInventory(), fetchLowInventory()])
      .then(([all, low]) => {
        setStats(computeStats(all));
        setLowItems(low);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-zinc-100 mb-1">Dashboard</h1>
      <p className="text-zinc-500 text-sm mb-8">Your pantry at a glance.</p>

      {/* Error banner */}
      {error && (
        <div className="mb-6 bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">
          Could not load inventory data: {error}
        </div>
      )}

      {/* Stats row */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
          Inventory Summary
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Products" value={stats.total} colorClass="text-zinc-100" loading={loading} />
          <StatCard label="In Stock" value={stats.stocked} colorClass="text-emerald-400" loading={loading} />
          <StatCard label="Running Low" value={stats.low} colorClass="text-amber-400" loading={loading} />
          <StatCard label="Out of Stock" value={stats.out} colorClass="text-red-400" loading={loading} />
        </div>
      </section>

      {/* Running Low alerts */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
          Running Low Alerts
        </h2>
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 h-20 animate-pulse" />
            ))}
          </div>
        ) : lowItems.length === 0 ? (
          <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 text-center">
            <p className="text-emerald-400 font-medium">All stocked up!</p>
            <p className="text-zinc-500 text-sm mt-1">No items are predicted to run out soon.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {lowItems.map((item) => (
              <AlertCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      {/* Spending overview (placeholder — no spending endpoint yet) */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
          Spending Overview
        </h2>
        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <span className="text-zinc-400 text-sm">Monthly comparison</span>
            <span className="text-xs text-zinc-600 italic">Spending analytics coming soon</span>
          </div>
          <div className="flex gap-6 items-end h-20">
            {/* Simple placeholder bars */}
            <div className="flex flex-col items-center gap-1 flex-1">
              <div className="w-full bg-zinc-700 rounded-t" style={{ height: "48px" }} />
              <span className="text-xs text-zinc-500">Last month</span>
            </div>
            <div className="flex flex-col items-center gap-1 flex-1">
              <div className="w-full bg-emerald-700 rounded-t" style={{ height: "64px" }} />
              <span className="text-xs text-zinc-400">This month</span>
            </div>
          </div>
          <p className="text-zinc-600 text-xs mt-3 text-center">
            Scan receipts to start tracking spend
          </p>
        </div>
      </section>

      {/* Quick actions */}
      <section>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/receipts"
            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-700 transition-colors rounded-xl p-5 flex flex-col gap-2 group"
          >
            <span className="text-2xl">📷</span>
            <span className="text-zinc-100 font-medium group-hover:text-emerald-400 transition-colors">
              Scan Receipt
            </span>
            <span className="text-zinc-500 text-xs">Upload a receipt to update inventory</span>
          </Link>
          <Link
            href="/shopping-list"
            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-700 transition-colors rounded-xl p-5 flex flex-col gap-2 group"
          >
            <span className="text-2xl">🛒</span>
            <span className="text-zinc-100 font-medium group-hover:text-emerald-400 transition-colors">
              View Shopping List
            </span>
            <span className="text-zinc-500 text-xs">Auto-generated from your burn rates</span>
          </Link>
          <Link
            href="/meal-planner"
            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-700 transition-colors rounded-xl p-5 flex flex-col gap-2 group"
          >
            <span className="text-2xl">🍽️</span>
            <span className="text-zinc-100 font-medium group-hover:text-emerald-400 transition-colors">
              Get Meal Ideas
            </span>
            <span className="text-zinc-500 text-xs">AI suggestions from your pantry</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
