"use client";

import React, { useEffect, useState, useMemo } from "react";

import { getInventory } from "@/lib/api";

interface InventoryItem {
  id: number;
  name: string;
  category: string | null;
  consumption_profile: string | null;
  status: "stocked" | "low" | "out";
  last_purchased: string | null;
  days_since_last_purchase: number | null;
  avg_interval_days: number | null;
  predicted_out_date: string | null;
}

type FilterTab = "all" | "stocked" | "low" | "out";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatLastPurchased(dateStr: string | null, daysSince: number | null): string {
  if (daysSince === 0) return "Today";
  if (daysSince === 1) return "Yesterday";
  if (daysSince != null) return `${daysSince}d ago`;
  if (dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  return "—";
}

function formatAvgFrequency(days: number | null): string {
  if (days == null) return "—";
  if (days < 7) return `Every ${Math.round(days)}d`;
  const weeks = days / 7;
  if (weeks < 4.5) return `Every ${weeks.toFixed(1).replace(".0", "")}w`;
  const months = days / 30;
  return `Every ${months.toFixed(1).replace(".0", "")}mo`;
}

function formatProfile(profile: string | null): string {
  if (!profile) return "—";
  return profile.charAt(0).toUpperCase() + profile.slice(1);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: InventoryItem["status"] }) {
  const map = {
    stocked: { label: "In Stock", className: "bg-emerald-900 text-emerald-300" },
    low: { label: "Running Low", className: "bg-amber-900 text-amber-300" },
    out: { label: "Out of Stock", className: "bg-red-900 text-red-300" },
  };
  const { label, className } = map[status];
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${className}`}>
      {label}
    </span>
  );
}

function ExpandedRow({
  item,
  selected,
  onToggleSelect,
}: {
  item: InventoryItem;
  selected: boolean;
  onToggleSelect: (id: number) => void;
}) {
  const borderColor =
    item.status === "out"
      ? "border-l-red-500"
      : item.status === "low"
      ? "border-l-amber-500"
      : "border-l-emerald-600";

  return (
    <tr>
      <td colSpan={7} className="px-0 pb-2">
        <div className={`mx-2 bg-zinc-800 rounded-xl border border-zinc-700 border-l-4 ${borderColor} p-4`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-zinc-500 text-xs mb-1">Category</p>
              <p className="text-zinc-200">{item.category ?? "Uncategorized"}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs mb-1">Consumption Profile</p>
              <p className="text-zinc-200">{formatProfile(item.consumption_profile)}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs mb-1">Avg Buy Frequency</p>
              <p className="text-zinc-200">{formatAvgFrequency(item.avg_interval_days)}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs mb-1">Predicted Out Date</p>
              <p className={item.status === "out" ? "text-red-400" : item.status === "low" ? "text-amber-400" : "text-zinc-200"}>
                {item.predicted_out_date
                  ? new Date(item.predicted_out_date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs mb-1">Last Purchased</p>
              <p className="text-zinc-200">
                {formatLastPurchased(item.last_purchased, item.days_since_last_purchase)}
              </p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs mb-1">Purchase History</p>
              <p className="text-zinc-400 text-xs italic">
                {item.avg_interval_days != null
                  ? `~${item.avg_interval_days.toFixed(1)}d avg between purchases`
                  : "Insufficient purchase data"}
              </p>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-zinc-800">
      {[1, 2, 3, 4, 5, 6, 7].map((n) => (
        <td key={n} className="px-4 py-3">
          <div className="h-4 bg-zinc-800 rounded animate-pulse" style={{ width: n === 1 ? "24px" : "80%" }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkActionFeedback, setBulkActionFeedback] = useState<string | null>(null);

  useEffect(() => {
    getInventory()
      .then((data) => setItems(data as InventoryItem[]))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = items;
    if (activeTab !== "all") {
      result = result.filter((i) => i.status === activeTab);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((i) => i.name.toLowerCase().includes(q));
    }
    return result;
  }, [items, activeTab, search]);

  const counts = useMemo(
    () => ({
      all: items.length,
      stocked: items.filter((i) => i.status === "stocked").length,
      low: items.filter((i) => i.status === "low").length,
      out: items.filter((i) => i.status === "out").length,
    }),
    [items]
  );

  // ── Row selection ──────────────────────────────────────────────────────────

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((i) => i.id)));
    }
  }

  // TODO: Wire to backend API once consumed/wasted endpoints exist (Phase 2)
  function handleBulkAction(action: "consumed" | "wasted") {
    const count = selectedIds.size;
    if (count === 0) return;
    // Optimistically update local state (mark selected items as "out" for consumed/wasted)
    setItems((prev) =>
      prev.map((item) =>
        selectedIds.has(item.id) ? { ...item, status: "out" as const } : item
      )
    );
    setSelectedIds(new Set());
    setBulkActionFeedback(
      `Marked ${count} item${count > 1 ? "s" : ""} as ${action}.`
    );
    setTimeout(() => setBulkActionFeedback(null), 3000);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "stocked", label: "In Stock" },
    { key: "low", label: "Running Low" },
    { key: "out", label: "Out of Stock" },
  ];

  const tabActiveClass = "bg-zinc-700 text-zinc-100";
  const tabInactiveClass = "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800";

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-zinc-100 mb-1">Inventory</h1>
      <p className="text-zinc-500 text-sm mb-6">
        {loading ? "Loading…" : `${items.length} products tracked`}
      </p>

      {/* Error banner */}
      {error && (
        <div className="mb-6 bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">
          Could not load inventory: {error}
        </div>
      )}

      {/* Bulk action feedback */}
      {bulkActionFeedback && (
        <div className="mb-4 bg-emerald-950 border border-emerald-800 text-emerald-300 text-sm rounded-lg px-4 py-3">
          {bulkActionFeedback}
        </div>
      )}

      {/* Search + bulk actions bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="search"
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-500"
        />
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-sm">{selectedIds.size} selected</span>
            <button
              onClick={() => handleBulkAction("consumed")}
              className="px-3 py-2 text-sm rounded-lg bg-emerald-900 hover:bg-emerald-800 text-emerald-300 border border-emerald-700 transition-colors"
            >
              Mark Consumed
            </button>
            <button
              onClick={() => handleBulkAction("wasted")}
              className="px-3 py-2 text-sm rounded-lg bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 transition-colors"
            >
              Mark Wasted
            </button>
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 bg-zinc-900 rounded-lg p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              setSelectedIds(new Set());
              setExpandedId(null);
            }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key ? tabActiveClass : tabInactiveClass
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-xs opacity-60">
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400 text-xs uppercase tracking-wide">
              <th className="px-4 py-3 text-left w-10">
                <input
                  type="checkbox"
                  checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                  onChange={toggleSelectAll}
                  className="accent-emerald-500 cursor-pointer"
                  aria-label="Select all"
                />
              </th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left hidden sm:table-cell">Category</th>
              <th className="px-4 py-3 text-left hidden md:table-cell">Profile</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left hidden lg:table-cell">Last Purchased</th>
              <th className="px-4 py-3 text-left hidden lg:table-cell">Avg Frequency</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              : filtered.length === 0
              ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-zinc-500">
                    {search
                      ? `No products matching "${search}"`
                      : "No products in this category."}
                  </td>
                </tr>
              )
              : filtered.map((item) => (
                  <React.Fragment key={item.id}>
                    <tr
                      onClick={() =>
                        setExpandedId((prev) => (prev === item.id ? null : item.id))
                      }
                      className={`border-b border-zinc-800 cursor-pointer transition-colors ${
                        expandedId === item.id
                          ? "bg-zinc-800"
                          : "hover:bg-zinc-800/60"
                      }`}
                    >
                      {/* Checkbox — stop propagation so click doesn't toggle row */}
                      <td
                        className="px-4 py-3"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(item.id);
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="accent-emerald-500 cursor-pointer"
                          aria-label={`Select ${item.name}`}
                        />
                      </td>

                      <td className="px-4 py-3 font-medium text-zinc-100">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs transition-transform ${
                              expandedId === item.id ? "rotate-90" : ""
                            }`}
                          >
                            ▶
                          </span>
                          {item.name}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-zinc-400 hidden sm:table-cell">
                        {item.category ?? <span className="text-zinc-600 italic">—</span>}
                      </td>

                      <td className="px-4 py-3 text-zinc-400 hidden md:table-cell">
                        {formatProfile(item.consumption_profile)}
                      </td>

                      <td className="px-4 py-3">
                        <StatusBadge status={item.status} />
                      </td>

                      <td className="px-4 py-3 text-zinc-400 hidden lg:table-cell">
                        {formatLastPurchased(item.last_purchased, item.days_since_last_purchase)}
                      </td>

                      <td className="px-4 py-3 text-zinc-400 hidden lg:table-cell">
                        {formatAvgFrequency(item.avg_interval_days)}
                      </td>
                    </tr>

                    {expandedId === item.id && (
                      <ExpandedRow
                        item={item}
                        selected={selectedIds.has(item.id)}
                        onToggleSelect={toggleSelect}
                      />
                    )}
                  </React.Fragment>
                ))}
          </tbody>
        </table>
      </div>

      {!loading && filtered.length > 0 && (
        <p className="text-zinc-600 text-xs mt-3 text-right">
          {filtered.length} of {items.length} products shown
        </p>
      )}
    </div>
  );
}
