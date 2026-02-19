"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Search, Package, ChevronRight } from "lucide-react";
import { getInventory } from "@/lib/api";
import { EmptyState, ErrorState } from "@/components/ui";

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
    stocked: { label: "Fresh", className: "bg-[#E8F3E8] text-status-fresh" },
    low: { label: "Running Low", className: "bg-[#FFF3E0] text-status-low" },
    out: { label: "Out", className: "bg-[#FDEAE5] text-status-out" },
  };
  const { label, className } = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${className}`}>
      ● {label}
    </span>
  );
}

function ExpandedRow({ item }: { item: InventoryItem }) {
  return (
    <tr>
      <td colSpan={7} className="px-0 pb-2">
        <div className="mx-2 bg-warm-50 rounded-xl border border-linen/50 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-warm-400 text-xs mb-1">Category</p>
              <p className="text-warm-700">{item.category ?? "Uncategorized"}</p>
            </div>
            <div>
              <p className="text-warm-400 text-xs mb-1">Consumption Profile</p>
              <p className="text-warm-700">{formatProfile(item.consumption_profile)}</p>
            </div>
            <div>
              <p className="text-warm-400 text-xs mb-1">Avg Buy Frequency</p>
              <p className="text-warm-700">{formatAvgFrequency(item.avg_interval_days)}</p>
            </div>
            <div>
              <p className="text-warm-400 text-xs mb-1">Predicted Out Date</p>
              <p className={
                item.status === "out" ? "text-status-out" :
                item.status === "low" ? "text-status-low" :
                "text-warm-700"
              }>
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
              <p className="text-warm-400 text-xs mb-1">Last Purchased</p>
              <p className="text-warm-700">
                {formatLastPurchased(item.last_purchased, item.days_since_last_purchase)}
              </p>
            </div>
            <div>
              <p className="text-warm-400 text-xs mb-1">Purchase History</p>
              <p className="text-warm-500 text-xs italic">
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
    <tr className="border-b border-linen/50">
      {[1, 2, 3, 4, 5, 6, 7].map((n) => (
        <td key={n} className="px-4 py-3.5">
          <div className="h-4 bg-warm-200 rounded animate-pulse" style={{ width: n === 1 ? "24px" : "80%" }} />
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

  return (
    <div className="max-w-6xl mx-auto animate-fade-in-up">
      <h1 className="font-heading text-2xl text-warm-900 mb-1">Inventory</h1>
      <p className="text-warm-500 text-sm mb-6">
        {loading ? "Loading…" : `${items.length} products tracked`}
      </p>

      {/* Error banner */}
      {error && (
        <div className="mb-6">
          <ErrorState message={`Could not load inventory: ${error}`} />
        </div>
      )}

      {/* Bulk action feedback */}
      {bulkActionFeedback && (
        <div className="mb-4 bg-[#E8F3E8] border border-sage-200 text-status-fresh text-sm rounded-xl px-4 py-3">
          {bulkActionFeedback}
        </div>
      )}

      {/* Search + bulk actions bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" strokeWidth={1.75} />
          <input
            type="search"
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-full border border-warm-300 bg-white text-warm-800 placeholder:text-warm-400 text-sm focus:outline-none focus:ring-2 focus:ring-sage-200 focus:border-sage-400 transition-all duration-200"
          />
        </div>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-warm-500 text-sm">{selectedIds.size} selected</span>
            <button
              onClick={() => handleBulkAction("consumed")}
              className="px-4 py-2 text-sm rounded-full bg-sage-500 hover:bg-sage-600 text-white font-medium transition-colors duration-200"
            >
              Mark Consumed
            </button>
            <button
              onClick={() => handleBulkAction("wasted")}
              className="px-4 py-2 text-sm rounded-full border border-terra-300 text-terra-700 hover:bg-terra-50 font-medium transition-colors duration-200"
            >
              Mark Wasted
            </button>
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              setSelectedIds(new Set());
              setExpandedId(null);
            }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors duration-200 ${
              activeTab === tab.key
                ? "bg-sage-500 text-white"
                : "bg-white border border-warm-300 text-warm-600 hover:bg-warm-50"
            }`}
          >
            {tab.label}
            <span className={`ml-1.5 text-xs ${activeTab === tab.key ? "opacity-80" : "opacity-60"}`}>
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-linen shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-linen">
                <th className="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                    onChange={toggleSelectAll}
                    className="accent-sage-500 cursor-pointer"
                    aria-label="Select all"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-warm-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-warm-500 hidden sm:table-cell">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-warm-500 hidden md:table-cell">Profile</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-warm-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-warm-500 hidden lg:table-cell">Last Purchased</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-warm-500 hidden lg:table-cell">Avg Frequency</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                : filtered.length === 0
                ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        icon={Package}
                        heading={search ? "No products found" : "Nothing here yet"}
                        subtext={
                          search
                            ? `No products matching "${search}"`
                            : "No products in this category."
                        }
                      />
                    </td>
                  </tr>
                )
                : filtered.map((item) => (
                    <React.Fragment key={item.id}>
                      <tr
                        onClick={() =>
                          setExpandedId((prev) => (prev === item.id ? null : item.id))
                        }
                        className={`border-b border-linen/50 cursor-pointer transition-colors duration-200 ${
                          expandedId === item.id
                            ? "bg-warm-50"
                            : "hover:bg-warm-50"
                        }`}
                      >
                        {/* Checkbox — stop propagation so click doesn't toggle row */}
                        <td
                          className="px-4 py-3.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelect(item.id);
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelect(item.id)}
                            className="accent-sage-500 cursor-pointer"
                            aria-label={`Select ${item.name}`}
                          />
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <ChevronRight
                              className={`w-3.5 h-3.5 text-warm-400 transition-transform duration-200 ${
                                expandedId === item.id ? "rotate-90" : ""
                              }`}
                              strokeWidth={2}
                            />
                            <span className="text-sm text-warm-800 font-medium">{item.name}</span>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 text-sm text-warm-600 hidden sm:table-cell">
                          {item.category ?? <span className="text-warm-400 italic">—</span>}
                        </td>

                        <td className="px-4 py-3.5 text-sm text-warm-600 hidden md:table-cell">
                          {formatProfile(item.consumption_profile)}
                        </td>

                        <td className="px-4 py-3.5">
                          <StatusBadge status={item.status} />
                        </td>

                        <td className="px-4 py-3.5 text-sm text-warm-600 hidden lg:table-cell">
                          {formatLastPurchased(item.last_purchased, item.days_since_last_purchase)}
                        </td>

                        <td className="px-4 py-3.5 text-sm text-warm-600 hidden lg:table-cell">
                          {formatAvgFrequency(item.avg_interval_days)}
                        </td>
                      </tr>

                      {expandedId === item.id && (
                        <ExpandedRow item={item} />
                      )}
                    </React.Fragment>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && filtered.length > 0 && (
        <p className="text-warm-400 text-xs mt-3 text-right">
          {filtered.length} of {items.length} products shown
        </p>
      )}
    </div>
  );
}
