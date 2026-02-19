"use client";

import { useRef, useState } from "react";
import { uploadReceipt } from "@/lib/api";

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

// ─── Upload Page ──────────────────────────────────────────────────────────────

export default function ReceiptsPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Three file inputs — all permanently in the DOM to avoid destroyed refs on iOS
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const dropInputRef = useRef<HTMLInputElement>(null);

  // ── File handling ──────────────────────────────────────────────────────────

  async function handleFile(file: File) {
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
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-zinc-100 mb-6">Upload Receipt</h1>

      {/* ── Hidden file inputs — permanently rendered so refs survive on iOS ── */}
      {/* Desktop/general file picker */}
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
      {/* Drop-zone input (unused — drag events handled on the div, kept for ref completeness) */}
      <input
        ref={dropInputRef}
        type="file"
        accept="image/*,image/heic,image/heif"
        className="hidden"
        onChange={onInputChange}
      />

      {/* ── Idle / Drop zone ──────────────────────────────────────────────── */}
      {stage === "idle" && (
        <div
          onClick={onZoneClick}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`
            relative flex flex-col items-center justify-center gap-4
            border-2 border-dashed rounded-xl p-10 cursor-pointer
            transition-colors select-none
            ${isDragging
              ? "border-emerald-500 bg-emerald-950/30"
              : "border-zinc-700 bg-zinc-900 hover:border-zinc-500"
            }
          `}
        >
          {/* Receipt icon */}
          <svg className="w-14 h-14 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>

          {/* Responsive instruction text */}
          <p className="block md:hidden text-zinc-400 text-center text-sm">
            Tap to choose photo or use camera
          </p>
          <p className="hidden md:block text-zinc-400 text-center text-sm">
            Drag &amp; drop, click to browse, or use camera
          </p>

          <p className="text-zinc-600 text-xs">JPEG, PNG, HEIC, WEBP accepted</p>

          {/* Camera button — stopPropagation prevents zone onClick from also firing */}
          <button
            type="button"
            onClick={onCameraClick}
            className="mt-2 flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Use Camera
          </button>
        </div>
      )}

      {/* ── Uploading ─────────────────────────────────────────────────────── */}
      {stage === "uploading" && (
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <svg className="w-8 h-8 animate-spin text-emerald-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-zinc-400">Processing receipt…</p>
        </div>
      )}

      {/* ── Review ────────────────────────────────────────────────────────── */}
      {stage === "review" && result && (
        <div className="space-y-4">
          {/* Header info */}
          <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-zinc-100 font-semibold text-lg">{result.store_name ?? "Unknown Store"}</p>
                <p className="text-zinc-500 text-sm">{result.receipt_date ?? "Date unknown"}</p>
              </div>
              {result.total_amount != null && (
                <p className="text-emerald-400 font-bold text-xl">${result.total_amount.toFixed(2)}</p>
              )}
            </div>
          </div>

          {/* Items table */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 text-left">
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium text-right">Qty</th>
                  <th className="px-4 py-3 font-medium text-right">Unit</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item) => (
                  <tr key={item.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-4 py-2 text-zinc-200">
                      {item.product_name}
                      {item.confidence != null && (item.confidence ?? 1) < 0.7 && (
                        <span className="ml-2 text-xs text-amber-500">low confidence</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-zinc-400 text-right">{item.quantity ?? "—"}</td>
                    <td className="px-4 py-2 text-zinc-400 text-right">
                      {item.unit_price != null ? `$${item.unit_price.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-zinc-300 text-right">
                      {item.total_price != null ? `$${item.total_price.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors"
            >
              Save to Inventory
            </button>
            <button
              onClick={handleRetry}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* ── Saving ────────────────────────────────────────────────────────── */}
      {stage === "saving" && (
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <svg className="w-8 h-8 animate-spin text-emerald-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-zinc-400">Saving to inventory…</p>
        </div>
      )}

      {/* ── Done ──────────────────────────────────────────────────────────── */}
      {stage === "done" && (
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <div className="w-14 h-14 rounded-full bg-emerald-900 flex items-center justify-center">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-zinc-100 font-semibold">Receipt saved!</p>
          <p className="text-zinc-500 text-sm">Items have been added to your inventory.</p>
          <button
            onClick={handleRetry}
            className="mt-2 px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
          >
            Upload Another
          </button>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {stage === "error" && (
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <div className="w-14 h-14 rounded-full bg-red-900 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="text-zinc-100 font-semibold">Something went wrong</p>
          {errorMsg && <p className="text-zinc-500 text-sm text-center max-w-xs">{errorMsg}</p>}
          <button
            onClick={handleRetry}
            className="mt-2 px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
