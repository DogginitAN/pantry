"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Search, Package, ChevronRight, ChevronDown, ChevronUp, ChevronLeft, ChevronsUpDown } from "lucide-react";
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
type SortCol = "name" | "category" | "last_purchased" | "avg_interval_days";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 50;

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

function compareNullable<T>(a: T | null, b: T | null, dir: SortDir): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a < b) return dir === "asc" ? -1 : 1;
  if (a > b) return dir === "asc" ? 1 : -1;
  return 0;
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

function SortIcon({ col, activeCol, dir }: { col: SortCol; activeCol: SortCol | null; dir: SortDir }) {
  if (activeCol !== col) {
    return <ChevronsUpDown className="w-3 h-3 text-warm-400 ml-1 inline-block" strokeWidth={1.75} />;
  }
  const Icon = dir === "asc" ? ChevronUp : ChevronDown;
  return <Icon className="w-3 h-3 text-sage-600 ml-1 inline-block" strokeWidth={2} />;
}

function SortableHeader({
  label,
  col,
  activeCol,
  dir,
  onSort,
  className,
}: {
  label: string;
  col: SortCol;
  activeCol: SortCol | null;
  dir: SortDir;
  onSort: (col: SortCol) => void;
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-3 text-left text-xs font-medium text-warm-500 cursor-pointer select-none hover:text-warm-700 transition-colors duration-200 ${className ?? ""}`}
      onClick={() => onSort(col)}
    >
      {label}
      <SortIcon col={col} activeCol={activeCol} dir={dir} />
    </th>
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
                  : "No purchase history yet"}
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
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkActionFeedback, setBulkActionFeedback] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);

  useEffect(() => {
    getInventory()
      .then((data) => setItems(data as InventoryItem[]))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // ── Categories ────────────────────────────────────────────────────────────

  const categories = useMemo(() => {
    const cats = new Set<string>();
    items.forEach((i) => { if (i.category) cats.add(i.category); });
    return Array.from(cats).sort();
  }, [items]);

  // ── Filtering + sorting ───────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = items;
    if (activeTab !== "all") {
      result = result.filter((i) => i.status === activeTab);
    }
    if (categoryFilter !== "all") {
      result = result.filter((i) => i.category === categoryFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((i) => i.name.toLowerCase().includes(q));
    }
    if (sortCol) {
      result = [...result].sort((a, b) => {
        switch (sortCol) {
          case "name":
            return compareNullable(a.name.toLowerCase(), b.name.toLowerCase(), sortDir);
          case "category":
            return compareNullable(a.category?.toLowerCase() ?? null, b.category?.toLowerCase() ?? null, sortDir);
          case "last_purchased":
            return compareNullable(a.days_since_last_purchase, b.days_since_last_purchase, sortDir);
          case "avg_interval_days":
            return compareNullable(a.avg_interval_days, b.avg_interval_days, sortDir);
          default:
            return 0;
        }
      });
    }
    return result;
  }, [items, activeTab, categoryFilter, search, sortCol, sortDir]);

  // ── Pagination ────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, filtered.length);
  const pageItems = filtered.slice(pageStart, pageEnd);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [activeTab, categoryFilter, search, sortCol, sortDir]);

  const counts = useMemo(
    () => ({
      all: items.length,
      stocked: items.filter((i) => i.status === "stocked").length,
      low: items.filter((i) => i.status === "low").length,
      out: items.filter((i) => i.status === "out").length,
    }),
    [items]
  );

  // ── Sort handler ──────────────────────────────────────────────────────────

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

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
    if (selectedIds.size === pageItems.length && pageItems.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pageItems.map((i) => i.id)));
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

      {/* Search + category filter + bulk actions bar */}
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
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-warm-300 bg-white text-warm-800 text-sm focus:outline-none focus:ring-2 focus:ring-sage-200 focus:border-sage-400 transition-all duration-200 appearance-none"
        >
          <option value="all">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
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
                    checked={selectedIds.size > 0 && selectedIds.size === pageItems.length}
                    onChange={toggleSelectAll}
                    className="accent-sage-500 cursor-pointer"
                    aria-label="Select all"
                  />
                </th>
                <SortableHeader label="Name" col="name" activeCol={sortCol} dir={sortDir} onSort={handleSort} />
                <SortableHeader label="Category" col="category" activeCol={sortCol} dir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
                <th className="px-4 py-3 text-left text-xs font-medium text-warm-500 hidden md:table-cell">Profile</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-warm-500">Status</th>
                <SortableHeader label="Last Purchased" col="last_purchased" activeCol={sortCol} dir={sortDir} onSort={handleSort} className="hidden lg:table-cell" />
                <SortableHeader label="Avg Frequency" col="avg_interval_days" activeCol={sortCol} dir={sortDir} onSort={handleSort} className="hidden lg:table-cell" />
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
                : pageItems.map((item) => (
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

      {/* Pagination */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-warm-500 text-sm">
            Showing {pageStart + 1}–{pageEnd} of {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-full border border-warm-300 text-warm-600 hover:bg-warm-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200"
            >
              <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2} />
              Prev
            </button>
            <span className="text-warm-500 text-sm">
              {safePage + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-full border border-warm-300 text-warm-600 hover:bg-warm-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
