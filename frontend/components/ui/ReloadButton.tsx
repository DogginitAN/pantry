"use client";

export default function ReloadButton() {
  return (
    <button
      onClick={() => window.location.reload()}
      className="px-6 py-2.5 bg-sage-500 hover:bg-sage-600 active:bg-sage-700 rounded-full text-white text-sm font-medium transition-colors shadow-sm"
    >
      Reload
    </button>
  );
}
