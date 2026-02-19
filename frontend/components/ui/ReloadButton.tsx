"use client";

export default function ReloadButton() {
  return (
    <button
      onClick={() => window.location.reload()}
      className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-100 transition-colors"
    >
      Reload
    </button>
  );
}
