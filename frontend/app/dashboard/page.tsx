"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Camera, ShoppingCart, ChefHat } from "lucide-react";
import { getInventory, getShoppingLists, ShoppingList } from "@/lib/api";

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
  value: number | null;
  colorClass: string;
  loading: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-linen p-6 shadow-card hover:shadow-card-hover transition-shadow duration-300 flex flex-col gap-1">
      <span className="text-warm-500 text-sm font-medium">{label}</span>
      {loading ? (
        <div className="h-8 w-16 bg-warm-200 rounded-lg animate-pulse mt-1" />
      ) : (
        <span className={`font-heading text-2xl text-warm-900 ${colorClass}`}>{value ?? "—"}</span>
      )}
    </div>
  );
}

function AlertCard({ item }: { item: InventoryItem }) {
  const isOut = item.status === "out";
  const badgeBg = isOut ? "bg-[#FDEAE5]" : "bg-[#FFF3E0]";
  const badgeText = isOut ? "text-status-out" : "text-status-low";
  const badgeLabel = isOut ? "Out of Stock" : "Running Low";
  const dateColor = isOut ? "text-status-out" : "text-status-low";

  return (
    <div className="bg-white rounded-xl border border-linen p-4 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-warm-800 font-medium truncate">{item.name}</p>
          <p className="text-warm-500 text-xs mt-0.5">{item.category ?? "Uncategorized"}</p>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${badgeBg} ${badgeText}`}>
          {badgeLabel}
        </span>
      </div>
      <div className="mt-3 flex gap-4 text-xs text-warm-500">
        <span>
          Last bought:{" "}
          <span className="text-warm-700">
            {item.days_since_last_purchase != null
              ? `${item.days_since_last_purchase}d ago`
              : "Never"}
          </span>
        </span>
        <span>
          Est. out:{" "}
          <span className={dateColor}>
            {formatPredictedDate(item.predicted_out_date)}
          </span>
        </span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>([]);
  const [shoppingListsError, setShoppingListsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([getInventory(), getShoppingLists()]).then(
      ([invResult, listsResult]) => {
        if (invResult.status === "fulfilled") {
          setItems(invResult.value as InventoryItem[]);
        } else {
          setError((invResult.reason as Error)?.message ?? "Failed to load inventory");
        }
        if (listsResult.status === "fulfilled") {
          setShoppingLists(listsResult.value);
        } else {
          setShoppingListsError(true);
        }
        setLoading(false);
      }
    );
  }, []);

  const stats = computeStats(items);
  const lowItems = items.filter((i) => i.status === "low" || i.status === "out");

  const openLists = shoppingLists.filter((l) => l.completed_at === null);
  const openListCount = shoppingListsError ? null : openLists.length;
  const uncheckedItems = shoppingListsError
    ? null
    : openLists.reduce((sum, l) => sum + (l.item_count ?? 0), 0);

  return (
    <div className="max-w-4xl mx-auto animate-fade-in-up">
      <h1 className="font-heading text-2xl text-warm-900 mb-1">Dashboard</h1>
      <p className="text-base text-warm-500 mb-8">Your pantry at a glance.</p>

      {error && (
        <div className="mb-6 bg-[#FDEAE5] border border-[#E8C4BB] text-status-out text-sm rounded-xl px-4 py-3">
          Could not load inventory data: {error}
        </div>
      )}

      <section className="mb-8 animate-fade-in-up" style={{ animationDelay: "50ms" }}>
        <h2 className="font-heading text-xl text-warm-800 mb-3">
          Inventory Summary
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Products" value={stats.total} colorClass="" loading={loading} />
          <StatCard label="In Stock" value={stats.stocked} colorClass="text-status-fresh" loading={loading} />
          <StatCard label="Running Low" value={stats.low} colorClass="text-status-low" loading={loading} />
          <StatCard label="Out of Stock" value={stats.out} colorClass="text-status-out" loading={loading} />
        </div>
      </section>

      <section className="mb-8 animate-fade-in-up" style={{ animationDelay: "100ms" }}>
        <h2 className="font-heading text-xl text-warm-800 mb-3">
          Shopping Lists
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Open Lists"
            value={openListCount}
            colorClass=""
            loading={loading}
          />
          <StatCard
            label="Total Items"
            value={uncheckedItems}
            colorClass=""
            loading={loading}
          />
        </div>
        {shoppingListsError && !loading && (
          <p className="text-warm-500 text-xs mt-2">Could not load shopping list data.</p>
        )}
      </section>

      <section className="mb-8 animate-fade-in-up" style={{ animationDelay: "150ms" }}>
        <h2 className="font-heading text-xl text-warm-800 mb-3">
          Running Low Alerts
        </h2>
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="bg-warm-200 rounded-xl p-4 h-20 animate-pulse" />
            ))}
          </div>
        ) : lowItems.length === 0 ? (
          <div className="bg-white rounded-xl border border-linen p-6 shadow-soft text-center">
            <p className="text-status-fresh font-medium">All stocked up!</p>
            <p className="text-warm-500 text-sm mt-1">No items are predicted to run out soon.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {lowItems.map((item) => (
              <AlertCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      <section className="mb-8 animate-fade-in-up" style={{ animationDelay: "200ms" }}>
        <h2 className="font-heading text-xl text-warm-800 mb-3">
          Spending
        </h2>
        <div className="bg-white rounded-2xl border border-linen p-6 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <span className="text-warm-500 text-sm">Monthly comparison</span>
            <span className="text-xs text-warm-500 italic">Spending analytics coming soon</span>
          </div>
          <div className="flex gap-6 items-end h-20">
            <div className="flex flex-col items-center gap-1 flex-1">
              <div className="w-full bg-warm-200 rounded-t" style={{ height: "48px" }} />
              <span className="text-xs text-warm-500">Last month</span>
            </div>
            <div className="flex flex-col items-center gap-1 flex-1">
              <div className="w-full bg-sage-300 rounded-t" style={{ height: "64px" }} />
              <span className="text-xs text-warm-500">This month</span>
            </div>
          </div>
          <p className="text-warm-500 text-xs mt-3 text-center">
            Scan receipts to start tracking spend
          </p>
        </div>
      </section>

      <section className="animate-fade-in-up" style={{ animationDelay: "250ms" }}>
        <h2 className="font-heading text-xl text-warm-800 mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/receipts"
            className="bg-white rounded-2xl border border-linen p-5 hover:shadow-card-hover transition-shadow duration-300 flex flex-col gap-2"
          >
            <Camera className="w-6 h-6 text-sage-500" strokeWidth={1.75} />
            <span className="text-warm-800 font-medium">
              Scan Receipt
            </span>
            <span className="text-warm-500 text-sm">Upload a receipt to update inventory</span>
          </Link>
          <Link
            href="/shopping-list"
            className="bg-white rounded-2xl border border-linen p-5 hover:shadow-card-hover transition-shadow duration-300 flex flex-col gap-2"
          >
            <ShoppingCart className="w-6 h-6 text-sage-500" strokeWidth={1.75} />
            <span className="text-warm-800 font-medium">
              View Shopping List
            </span>
            <span className="text-warm-500 text-sm">Auto-generated from your burn rates</span>
          </Link>
          <Link
            href="/meal-planner"
            className="bg-white rounded-2xl border border-linen p-5 hover:shadow-card-hover transition-shadow duration-300 flex flex-col gap-2"
          >
            <ChefHat className="w-6 h-6 text-sage-500" strokeWidth={1.75} />
            <span className="text-warm-800 font-medium">
              Get Meal Ideas
            </span>
            <span className="text-warm-500 text-sm">AI suggestions from your pantry</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
