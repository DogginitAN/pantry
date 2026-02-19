"use client";

import { useState, useEffect } from "react";
import { getAISettings, updateAISettings, exportJSON, exportCSV, type AISettings } from "@/lib/api";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [provider, setProvider] = useState<"local" | "cloud">("local");
  const [ollamaUrl, setOllamaUrl] = useState("");
  const [ollamaModel, setOllamaModel] = useState("");
  const [cloudModel, setCloudModel] = useState("");
  const [saveFeedback, setSaveFeedback] = useState<{ msg: string; ok: boolean } | null>(null);
  const [exportingJSON, setExportingJSON] = useState(false);
  const [exportingCSV, setExportingCSV] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    getAISettings()
      .then((s) => {
        setSettings(s);
        setProvider(s.provider);
        setOllamaUrl(s.ollama_base_url);
        setOllamaModel(s.ollama_model);
        setCloudModel(s.cloud_model);
      })
      .catch(() => {
        // leave defaults
      });
  }, []);

  function showFeedback(msg: string, ok: boolean) {
    setSaveFeedback({ msg, ok });
    setTimeout(() => setSaveFeedback(null), 2000);
  }

  async function handleSave() {
    try {
      const patch: Partial<AISettings> = { provider };
      if (provider === "local") {
        patch.ollama_base_url = ollamaUrl;
        patch.ollama_model = ollamaModel;
      } else {
        patch.cloud_model = cloudModel;
      }
      const updated = await updateAISettings(patch);
      setSettings(updated);
      showFeedback("Saved!", true);
    } catch (e) {
      showFeedback(e instanceof Error ? e.message : "Save failed.", false);
    }
  }

  async function handleExportJSON() {
    setExportError(null);
    setExportingJSON(true);
    try {
      await exportJSON();
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExportingJSON(false);
    }
  }

  async function handleExportCSV() {
    setExportError(null);
    setExportingCSV(true);
    try {
      await exportCSV();
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExportingCSV(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-zinc-100">Settings</h1>

      {/* AI Provider Config */}
      <div className="bg-zinc-900 rounded-lg p-6 space-y-5">
        <h2 className="text-lg font-semibold text-zinc-100">AI Provider</h2>

        {/* Provider toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setProvider("local")}
            className={`px-4 py-2 rounded font-medium text-sm transition-colors ${
              provider === "local"
                ? "bg-emerald-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Local (Ollama)
          </button>
          <button
            onClick={() => setProvider("cloud")}
            className={`px-4 py-2 rounded font-medium text-sm transition-colors ${
              provider === "cloud"
                ? "bg-emerald-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Cloud
          </button>
        </div>

        {/* Local fields */}
        {provider === "local" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Ollama Base URL
              </label>
              <input
                type="text"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Ollama Model
              </label>
              <input
                type="text"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                placeholder="qwen2.5:3b"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        )}

        {/* Cloud fields */}
        {provider === "cloud" && (
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Cloud Model Name
            </label>
            <input
              type="text"
              value={cloudModel}
              onChange={(e) => setCloudModel(e.target.value)}
              placeholder="claude-sonnet-4-5"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium text-sm transition-colors"
          >
            Save
          </button>
          {saveFeedback && (
            <span
              className={`text-sm font-medium ${
                saveFeedback.ok ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {saveFeedback.msg}
            </span>
          )}
        </div>
      </div>

      {/* Data Export */}
      <div className="bg-zinc-900 rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-zinc-100">Data Export</h2>
        <p className="text-sm text-zinc-400">
          Download all your pantry data as JSON or CSV.
        </p>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleExportJSON}
            disabled={exportingJSON}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 disabled:cursor-not-allowed text-zinc-100 rounded font-medium text-sm transition-colors"
          >
            {exportingJSON ? (
              <svg
                className="animate-spin h-4 w-4 text-zinc-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
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
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
            ) : null}
            Export JSON
          </button>
          <button
            onClick={handleExportCSV}
            disabled={exportingCSV}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 disabled:cursor-not-allowed text-zinc-100 rounded font-medium text-sm transition-colors"
          >
            {exportingCSV ? (
              <svg
                className="animate-spin h-4 w-4 text-zinc-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
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
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
            ) : null}
            Export CSV
          </button>
        </div>
        {exportError && (
          <p className="text-sm text-red-400">{exportError}</p>
        )}
      </div>
    </div>
  );
}
