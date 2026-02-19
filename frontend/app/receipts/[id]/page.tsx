"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getReceipt, Receipt, ReceiptItem } from "@/lib/api";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8060/api";

const STATUS_COLORS: Record<string, string> = {
  processing: "bg-blue-900 text-blue-300",
  ready: "bg-amber-900 text-amber-300",
  saved: "bg-emerald-900 text-emerald-300",
  failed: "bg-red-900 text-red-300",
};

export default function ReceiptDetailPage() {
  const params = useParams();
  const receiptId = Number(params.id as string);

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  function loadReceipt() {
    setLoading(true);
    setError(null);
    getReceipt(receiptId)
      .then((data) => {
        setReceipt(data.receipt);
        setItems(data.items);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load receipt");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadReceipt();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptId]);

  async function handleConfirm() {
    setConfirming(true);
    setConfirmError(null);
    try {
      const res = await fetch(`${BASE_URL}/receipts/${receiptId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`Confirm error ${res.status}`);
      loadReceipt();
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setConfirming(false);
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="w-8 h-8 animate-spin text-emerald-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  // ── Error / not found ────────────────────────────────────────────────────────

  if (error || !receipt) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        {/* Back link — Link instead of router.back() to handle direct URL access */}
        <Link
          href="/receipts"
          className="text-zinc-400 hover:text-zinc-100 text-sm flex items-center gap-1 mb-6"
        >
          ← Back to Receipts
        </Link>
        <div className="bg-red-950 border border-red-800 text-red-300 rounded-xl p-4 text-sm">
          {error ?? "Receipt not found"}
        </div>
      </div>
    );
  }

  const displayDate = receipt.receipt_date || receipt.created_at;
  const statusColor = STATUS_COLORS[receipt.processing_status] ?? "bg-zinc-800 text-zinc-400";

  // ── Main render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      {/* Back link — Link instead of router.back() to handle direct URL access */}
      <Link
        href="/receipts"
        className="text-zinc-400 hover:text-zinc-100 text-sm flex items-center gap-1 mb-6"
      >
        ← Back to Receipts
      </Link>

      {/* Receipt header */}
      <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">
              {receipt.store_name ?? "Unknown Store"}
            </h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              {displayDate
                ? new Date(displayDate).toLocaleDateString()
                : "Date unknown"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {receipt.total_amount != null && (
              <span className="text-emerald-400 font-bold text-xl">
                ${receipt.total_amount.toFixed(2)}
              </span>
            )}
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusColor}`}>
              {receipt.processing_status}
            </span>
          </div>
        </div>
      </div>

      {/* Items table — overflow-x-auto so table scrolls horizontally on mobile */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 mb-4">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-300">
            Items ({items.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 text-left">
                <th className="px-4 py-3 font-medium whitespace-nowrap">Product</th>
                <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Qty</th>
                <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Unit Price</th>
                <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Total</th>
                <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Conf.</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    No items found
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-zinc-800/50 last:border-0"
                  >
                    <td className="px-4 py-2 text-zinc-200 whitespace-nowrap">
                      {item.product_name}
                      {(item.confidence ?? 1) < 0.7 && (
                        <span className="ml-2 text-xs text-amber-500">
                          low confidence
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-zinc-400 text-right whitespace-nowrap">
                      {item.quantity ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-zinc-400 text-right whitespace-nowrap">
                      {item.unit_price != null
                        ? `$${item.unit_price.toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-zinc-300 text-right whitespace-nowrap">
                      {item.total_price != null
                        ? `$${item.total_price.toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {item.confidence != null ? (
                        <span
                          className={
                            item.confidence < 0.7
                              ? "text-amber-400"
                              : "text-emerald-400"
                          }
                        >
                          {Math.round(item.confidence * 100)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm — shown only when status is "ready" */}
      {receipt.processing_status === "ready" && (
        <div>
          {confirmError && (
            <p className="text-red-400 text-sm mb-2">{confirmError}</p>
          )}
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            {confirming && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            {confirming ? "Saving…" : "Save to Inventory"}
          </button>
        </div>
      )}
    </div>
  );
}
