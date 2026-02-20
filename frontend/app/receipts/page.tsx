"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { Upload, Camera, Receipt as ReceiptIcon } from "lucide-react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { uploadReceipt, getReceipts, Receipt } from "@/lib/api";
import { EmptyState } from "@/components/ui";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReceiptItem {
  id: number;
  product_name: string;
  quantity: number | null;
  unit_price: number | null;
  total_price: number | null;
  confidence: number | null;
}

interface UploadResult {
  id: number;
  store_name: string | null;
  receipt_date: string | null;
  total_amount: number | null;
  processing_status: string;
  items: ReceiptItem[];
}

type Stage = "idle" | "uploading" | "review" | "saving" | "done" | "error";

// ─── StatusBadge ──────────────────────────────────────────────────────────────

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

// ─── Upload Page ──────────────────────────────────────────────────────────────

export default function ReceiptsPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  // Two file inputs — permanently in the DOM to avoid destroyed refs on iOS
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Load past receipts for the idle-state list
  useEffect(() => {
    getReceipts()
      .then(setReceipts)
      .catch(() => {}); // silent — list is optional
  }, []);

  // ── File handling ──────────────────────────────────────────────────────────

  async function handleFile(file: File) {
    if (stage === "uploading" || stage === "saving") return; // prevent double-submit
    setStage("uploading");
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await uploadReceipt(formData) as UploadResult;
      setResult(data);
      setStage("review");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Upload failed.");
      setStage("error");
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow reselecting same file after error
    if (file) handleFile(file);
  }

  // ── Drag-and-drop (desktop only) ──────────────────────────────────────────

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); // required to allow drop
    setIsDragging(true);
  }

  function onDragLeave() {
    setIsDragging(false);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); // required to consume the drop
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  // Zone onClick opens the desktop file picker (not camera)
  function onZoneClick() {
    desktopInputRef.current?.click();
  }

  function onCameraClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation(); // prevent zone's onClick from also firing
    cameraInputRef.current?.click();
  }

  // ── Confirm / retry ────────────────────────────────────────────────────────

  async function handleConfirm() {
    if (!result) return;
    setStage("saving");
    try {
      const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8060/api";
      const res = await fetch(`${BASE_URL}/receipts/${result.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`Confirm error ${res.status}`);
      setStage("done");
      // Refresh receipts list so it's ready when user returns to idle
      getReceipts().then(setReceipts).catch(() => {});
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Save failed.");
      setStage("error");
    }
  }

  function handleRetry() {
    setStage("idle");
    setResult(null);
    setErrorMsg(null);
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto animate-fade-in-up">
      <h1 className="font-heading text-2xl text-warm-900 mb-1">Receipts</h1>
      <p className="text-warm-500 text-sm mb-6">Scan and manage your grocery receipts.</p>

      {/* ── Hidden file inputs — permanently rendered so refs survive on iOS ── */}
      {/* Desktop/general file picker — static accept prop required for iOS */}
      <input
        ref={desktopInputRef}
        type="file"
        accept="image/*,image/heic,image/heif"
        className="hidden"
        onChange={onInputChange}
      />
      {/* Camera capture — static accept + capture props required for iOS Safari */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*,image/heic,image/heif"
        capture="environment"
        className="hidden"
        onChange={onInputChange}
      />

      {/* ── Idle / Drop zone ──────────────────────────────────────────────── */}
      {stage === "idle" && (
        <>
          <div
            onClick={onZoneClick}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`
              relative flex flex-col items-center justify-center gap-3
              border-2 border-dashed rounded-2xl p-8 cursor-pointer
              text-center transition-colors select-none
              ${isDragging
                ? "border-sage-400 bg-sage-50/30"
                : "bg-warm-50 border-warm-300 hover:border-sage-400 hover:bg-sage-50/30"
              }
            `}
          >
            <Upload className="w-12 h-12 text-warm-400 mb-1" strokeWidth={1.25} />

            {/* Responsive instruction text */}
            <p className="block md:hidden text-warm-600 text-sm">
              Tap to choose photo or use camera
            </p>
            <p className="hidden md:block text-warm-600 text-sm">
              Drag &amp; drop, click to browse, or use camera
            </p>

            <p className="text-warm-400 text-xs">JPEG, PNG, HEIC, WEBP accepted</p>

            {/* Camera button — stopPropagation prevents zone onClick from also firing */}
            <button
              type="button"
              onClick={onCameraClick}
              className="mt-2 flex items-center gap-2 px-6 py-2.5 min-h-[44px] bg-sage-500 hover:bg-sage-600 active:bg-sage-700 text-white rounded-full text-sm font-medium transition-colors shadow-sm"
            >
              <Camera className="w-4 h-4" strokeWidth={1.75} />
              Use Camera
            </button>
          </div>

          {/* Past receipts list */}
          <div className="mt-8 animate-fade-in-up" style={{ animationDelay: "100ms" }}>
            <h2 className="font-heading text-xl text-warm-800 mb-4">Past Receipts</h2>
            {receipts.length === 0 ? (
              <EmptyState
                icon={ReceiptIcon}
                heading="No receipts yet"
                subtext="Upload your first receipt above to start tracking your grocery spending."
              />
            ) : (
              <div className="space-y-3">
                {receipts.map((receipt) => (
                  <Link
                    key={receipt.id}
                    href={`/receipts/${receipt.id}`}
                    className="block bg-white rounded-2xl border border-linen p-5 shadow-card hover:shadow-card-hover transition-shadow"
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0">
                        <p className="text-warm-800 font-semibold truncate">
                          {receipt.store_name ?? "Unknown Store"}
                        </p>
                        <p className="text-warm-500 text-sm">
                          {new Date(receipt.receipt_date || receipt.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {receipt.total_amount != null && (
                          <span className="text-warm-700 font-medium text-sm">
                            ${receipt.total_amount.toFixed(2)}
                          </span>
                        )}
                        <StatusBadge status={receipt.processing_status} />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Uploading ─────────────────────────────────────────────────────── */}
      {stage === "uploading" && (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <DotLottieReact
            src="/animations/receipt-processing.lottie"
            loop
            autoplay
            style={{ width: 180, height: 180 }}
          />
          <p className="text-warm-500 text-sm italic">
            Analyzing your receipt… This usually takes 15–20 seconds
          </p>
        </div>
      )}

      {/* ── Review ────────────────────────────────────────────────────────── */}
      {stage === "review" && result && (
        <div className="space-y-4">
          {/* Header card */}
          <div className="bg-white rounded-2xl border border-linen p-5 shadow-card">
            <div className="flex justify-between items-start gap-3">
              <div>
                <p className="text-warm-800 font-semibold text-base">
                  {result.store_name ?? "Unknown Store"}
                </p>
                <p className="text-warm-500 text-sm">
                  {result.receipt_date
                    ? new Date(result.receipt_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : "Date unknown"}
                </p>
              </div>
              {result.total_amount != null && (
                <p className="text-sage-600 font-semibold text-xl shrink-0">
                  ${result.total_amount.toFixed(2)}
                </p>
              )}
            </div>
          </div>

          {/* Items table */}
          <div className="bg-white rounded-2xl border border-linen shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-linen">
                    <th className="px-4 py-3 text-left text-xs font-medium text-warm-500">Item</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-warm-500">Qty</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-warm-500">Unit</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-warm-500">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-linen/50 last:border-0 hover:bg-warm-50 transition-colors"
                    >
                      <td className="px-4 py-3.5 text-warm-800 font-medium">
                        {item.product_name}
                        {item.confidence != null && (item.confidence ?? 1) < 0.7 && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#FFF3E0] text-status-low">
                            low confidence
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-warm-500 text-right whitespace-nowrap">
                        {item.quantity ?? "—"}
                      </td>
                      <td className="px-4 py-3.5 text-warm-500 text-right whitespace-nowrap">
                        {item.unit_price != null ? `$${item.unit_price.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-warm-600 text-right whitespace-nowrap">
                        {item.total_price != null ? `$${item.total_price.toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              className="flex-1 py-2.5 min-h-[44px] bg-sage-500 hover:bg-sage-600 active:bg-sage-700 text-white rounded-full font-medium text-sm transition-colors shadow-sm"
            >
              Save to Inventory
            </button>
            <button
              onClick={handleRetry}
              className="px-6 py-2.5 min-h-[44px] border border-sage-300 text-sage-700 rounded-full text-sm font-medium hover:bg-sage-50 active:bg-sage-100 transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* ── Saving ────────────────────────────────────────────────────────── */}
      {stage === "saving" && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="w-6 h-6 border-2 border-sage-200 border-t-sage-500 rounded-full animate-spin" />
          <p className="text-warm-500 text-sm">Saving to inventory…</p>
        </div>
      )}

      {/* ── Done ──────────────────────────────────────────────────────────── */}
      {stage === "done" && (
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <div className="w-14 h-14 rounded-full bg-[#E8F3E8] flex items-center justify-center">
            <svg className="w-8 h-8 text-status-fresh" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="font-heading text-xl text-warm-900">Receipt saved!</p>
          <p className="text-warm-500 text-sm">Items have been added to your inventory.</p>
          <button
            onClick={handleRetry}
            className="mt-2 px-6 py-2.5 min-h-[44px] border border-sage-300 text-sage-700 rounded-full text-sm font-medium hover:bg-sage-50 transition-colors"
          >
            Upload Another
          </button>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {stage === "error" && (
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <div className="w-14 h-14 rounded-full bg-[#FDEAE5] flex items-center justify-center">
            <svg className="w-8 h-8 text-status-out" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="font-heading text-xl text-warm-900">Something went wrong</p>
          {errorMsg && <p className="text-warm-500 text-sm text-center max-w-xs">{errorMsg}</p>}
          <button
            onClick={handleRetry}
            className="mt-2 px-6 py-2.5 min-h-[44px] bg-sage-500 hover:bg-sage-600 active:bg-sage-700 text-white rounded-full text-sm font-medium transition-colors shadow-sm"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
