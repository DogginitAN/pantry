"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getReceipt, Receipt, ReceiptItem } from "@/lib/api";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8060/api";

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "processing") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-sage-100 text-sage-700">
        <span className="w-3 h-3 border border-sage-300 border-t-sage-600 rounded-full animate-spin" />
        Processing
      </span>
    );
  }
  const cls: Record<string, string> = {
    pending: "bg-warm-200 text-warm-600",
    ready:   "bg-[#E8F3E8] text-status-fresh",
    saved:   "bg-sage-100 text-sage-600",
    failed:  "bg-[#FDEAE5] text-status-out",
  };
  const labels: Record<string, string> = {
    pending: "Pending",
    ready:   "Ready",
    saved:   "Saved",
    failed:  "Failed",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${cls[status] ?? "bg-warm-200 text-warm-500"}`}>
      ● {labels[status] ?? status}
    </span>
  );
}

// ─── Detail Page ──────────────────────────────────────────────────────────────

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
        <div className="w-6 h-6 border-2 border-sage-200 border-t-sage-500 rounded-full animate-spin" />
      </div>
    );
  }

  // ── Error / not found ────────────────────────────────────────────────────────

  if (error || !receipt) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        {/* Link instead of router.back() to handle direct URL access */}
        <Link
          href="/receipts"
          className="text-warm-500 hover:text-warm-800 text-sm flex items-center gap-1 mb-6 transition-colors"
        >
          ← Back to Receipts
        </Link>
        <div className="bg-[#FDEAE5] border border-[#E8C4BB] text-status-out rounded-xl p-4 text-sm">
          {error ?? "Receipt not found"}
        </div>
      </div>
    );
  }

  const displayDate = receipt.receipt_date || receipt.created_at;

  // ── Main render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto animate-fade-in-up">
      {/* Link instead of router.back() to handle direct URL access */}
      <Link
        href="/receipts"
        className="text-warm-500 hover:text-warm-800 text-sm flex items-center gap-1 mb-6 transition-colors"
      >
        ← Back to Receipts
      </Link>

      {/* Receipt header */}
      <div className="bg-white rounded-2xl border border-linen p-5 shadow-card mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl text-warm-900">
              {receipt.store_name ?? "Unknown Store"}
            </h1>
            <p className="text-warm-500 text-sm mt-0.5">
              {displayDate
                ? new Date(displayDate).toLocaleDateString()
                : "Date unknown"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {receipt.total_amount != null && (
              <span className="text-warm-800 font-semibold text-xl">
                ${receipt.total_amount.toFixed(2)}
              </span>
            )}
            <StatusBadge status={receipt.processing_status} />
          </div>
        </div>
      </div>

      {/* Items table — overflow-x-auto so table scrolls horizontally on mobile */}
      <div className="bg-white rounded-2xl border border-linen shadow-card mb-4">
        <div className="px-5 py-4 border-b border-linen">
          <h2 className="font-heading text-xl text-warm-800">
            Items ({items.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-linen">
                <th className="px-5 py-3 text-left text-xs font-medium text-warm-500 whitespace-nowrap">Product</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-warm-500 whitespace-nowrap">Qty</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-warm-500 whitespace-nowrap">Unit Price</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-warm-500 whitespace-nowrap">Total</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-warm-500 whitespace-nowrap">Conf.</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-warm-400">
                    No items found
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-linen/50 last:border-0 hover:bg-warm-50 transition-colors"
                  >
                    <td className="px-5 py-3.5 text-warm-800 font-medium whitespace-nowrap">
                      {item.product_name}
                      {(item.confidence ?? 1) < 0.7 && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#FFF3E0] text-status-low">
                          low confidence
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-warm-500 text-right whitespace-nowrap">
                      {item.quantity ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 text-warm-500 text-right whitespace-nowrap">
                      {item.unit_price != null
                        ? `$${item.unit_price.toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-warm-600 text-right whitespace-nowrap">
                      {item.total_price != null
                        ? `$${item.total_price.toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      {item.confidence != null ? (
                        <span
                          className={
                            item.confidence < 0.7
                              ? "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#FFF3E0] text-status-low"
                              : "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#E8F3E8] text-status-fresh"
                          }
                        >
                          {Math.round(item.confidence * 100)}%
                        </span>
                      ) : (
                        <span className="text-warm-400">—</span>
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
            <p className="text-status-out text-sm mb-2">{confirmError}</p>
          )}
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="w-full py-2.5 min-h-[44px] bg-sage-500 hover:bg-sage-600 active:bg-sage-700 disabled:opacity-50 text-white rounded-full font-medium text-sm transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            {confirming && (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {confirming ? "Saving…" : "Save to Inventory"}
          </button>
        </div>
      )}
    </div>
  );
}
