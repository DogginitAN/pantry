"use client";

import { useState, useEffect } from "react";
import { Download } from "lucide-react";
import { getAISettings, updateAISettings, exportJSON, exportCSV, type AISettings } from "@/lib/api";

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

export default function SettingsPage() {
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [provider, setProvider] = useState<"local" | "cloud">("local");
  const [ollamaUrl, setOllamaUrl] = useState("");
  const [ollamaModel, setOllamaModel] = useState("");
  const [cloudModel, setCloudModel] = useState("");
  const [saveFeedback, setSaveFeedback] = useState<{ msg: string; ok: boolean } | null>(null);
  const [exportingJSON, setExportingJSON] = useState(false);
  const [exportingCSV, setExportingCSV] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{ ok: boolean; msg: string } | null>(null);

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
      })
      .finally(() => setLoadingSettings(false));
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
      showFeedback("Settings saved!", true);
    } catch (e) {
      showFeedback(e instanceof Error ? e.message : "Save failed.", false);
    }
  }

  async function handleTestConnection() {
    setTestingConnection(true);
    setConnectionResult(null);
    let result: { ok: boolean; msg: string };
    try {
      const url = provider === "local" ? (ollamaUrl || "http://localhost:11434") : null;
      if (url) {
        const res = await fetch(`${url}/api/tags`).catch(() => null);
        result = res && res.ok
          ? { ok: true, msg: "✓ Connected" }
          : { ok: false, msg: "✗ Connection failed" };
      } else {
        result = { ok: true, msg: "✓ Connected" };
      }
    } catch {
      result = { ok: false, msg: "✗ Connection failed" };
    } finally {
      setTestingConnection(false);
    }
    setConnectionResult(result);
    setTimeout(() => setConnectionResult(null), 3000);
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

  const inputClass =
    "w-full px-4 py-3 rounded-xl border border-warm-300 bg-white text-warm-800 text-sm placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-sage-200 focus:border-sage-400 transition-all duration-200";

  const labelClass = "block text-sm font-medium text-warm-700 mb-1.5";

  if (loadingSettings) {
    return (
      <div className="p-6 space-y-8 max-w-2xl animate-fade-in-up">
        <h1 className="font-heading text-2xl text-warm-900">Settings</h1>
        <div className="bg-white rounded-2xl border border-linen p-6 shadow-card space-y-4">
          <div className="h-5 w-32 bg-warm-200 rounded-lg animate-pulse" />
          <div className="h-4 w-20 bg-warm-200 rounded-lg animate-pulse" />
          <div className="flex gap-2">
            <div className="h-10 w-32 bg-warm-200 rounded-full animate-pulse" />
            <div className="h-10 w-24 bg-warm-200 rounded-full animate-pulse" />
          </div>
          <div className="h-10 w-full bg-warm-200 rounded-xl animate-pulse" />
          <div className="h-10 w-full bg-warm-200 rounded-xl animate-pulse" />
        </div>
        <div className="bg-white rounded-2xl border border-linen p-6 shadow-card space-y-4">
          <div className="h-5 w-28 bg-warm-200 rounded-lg animate-pulse" />
          <div className="flex gap-3">
            <div className="h-10 w-32 bg-warm-200 rounded-full animate-pulse" />
            <div className="h-10 w-32 bg-warm-200 rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 max-w-2xl animate-fade-in-up">
      <div>
        <h1 className="font-heading text-2xl text-warm-900 mb-1">Settings</h1>
        <p className="text-warm-500 text-sm">Manage your AI provider and data settings.</p>
      </div>

      {/* AI Provider Config */}
      <div className="bg-white rounded-2xl border border-linen p-6 shadow-card space-y-5">
        <h2 className="font-heading text-lg text-warm-800 mb-4">AI Provider</h2>

        {/* Provider toggle */}
        <div>
          <p className={labelClass}>Provider</p>
          <div className="flex gap-2">
            <button
              onClick={() => setProvider("local")}
              className={`px-5 py-2.5 rounded-full font-medium text-sm transition-colors duration-200 ${
                provider === "local"
                  ? "bg-sage-500 text-white shadow-sm"
                  : "border border-sage-300 text-sage-700 hover:bg-sage-50"
              }`}
            >
              Local (Ollama)
            </button>
            <button
              onClick={() => setProvider("cloud")}
              className={`px-5 py-2.5 rounded-full font-medium text-sm transition-colors duration-200 ${
                provider === "cloud"
                  ? "bg-sage-500 text-white shadow-sm"
                  : "border border-sage-300 text-sage-700 hover:bg-sage-50"
              }`}
            >
              Cloud
            </button>
          </div>
        </div>

        {/* Local fields */}
        {provider === "local" && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Ollama Base URL</label>
              <input
                type="text"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className={inputClass}
              />
              <p className="text-xs text-warm-400 mt-1.5">
                The base URL where your Ollama server is running.
              </p>
            </div>
            <div>
              <label className={labelClass}>Ollama Model</label>
              <input
                type="text"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                placeholder="qwen2.5:3b"
                className={inputClass}
              />
              <p className="text-xs text-warm-400 mt-1.5">
                The model name to use for classification and meal planning.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleTestConnection}
                disabled={testingConnection}
                className="flex items-center gap-2 border border-sage-300 text-sage-700 font-medium text-sm px-5 py-2.5 rounded-full hover:bg-sage-50 active:bg-sage-100 transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {testingConnection ? <Spinner /> : null}
                Test Connection
              </button>
              {connectionResult && (
                <span
                  className={`text-sm font-medium ${
                    connectionResult.ok ? "text-status-fresh" : "text-status-out"
                  }`}
                >
                  {connectionResult.msg}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Cloud fields */}
        {provider === "cloud" && (
          <div>
            <label className={labelClass}>Cloud Model Name</label>
            <input
              type="text"
              value={cloudModel}
              onChange={(e) => setCloudModel(e.target.value)}
              placeholder="claude-sonnet-4-5"
              className={inputClass}
            />
            <p className="text-xs text-warm-400 mt-1.5">
              The cloud model identifier to use for AI features.
            </p>
          </div>
        )}

        <div className="flex items-center gap-3 pt-1 border-t border-linen">
          <button
            onClick={handleSave}
            className="bg-sage-500 text-white font-medium text-sm px-6 py-2.5 rounded-full hover:bg-sage-600 active:bg-sage-700 transition-colors duration-200 shadow-sm mt-4"
          >
            Save Settings
          </button>
          {saveFeedback && (
            <span
              className={`text-sm font-medium mt-4 ${
                saveFeedback.ok ? "text-status-fresh" : "text-status-out"
              }`}
            >
              {saveFeedback.msg}
            </span>
          )}
        </div>
      </div>

      {/* Data Export */}
      <div className="bg-white rounded-2xl border border-linen p-6 shadow-card">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-10 h-10 bg-sage-50 rounded-xl flex items-center justify-center shrink-0">
            <Download className="w-5 h-5 text-sage-500" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="font-heading text-lg text-warm-800">Data Export</h2>
            <p className="text-xs text-warm-400 mt-0.5">
              Download all your pantry data for backup or external analysis.
            </p>
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleExportJSON}
            disabled={exportingJSON}
            className="flex items-center gap-2 bg-sage-500 text-white font-medium text-sm px-6 py-2.5 rounded-full hover:bg-sage-600 active:bg-sage-700 transition-colors duration-200 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {exportingJSON ? <Spinner /> : <Download className="w-4 h-4" strokeWidth={1.75} />}
            Export JSON
          </button>
          <button
            onClick={handleExportCSV}
            disabled={exportingCSV}
            className="flex items-center gap-2 bg-sage-500 text-white font-medium text-sm px-6 py-2.5 rounded-full hover:bg-sage-600 active:bg-sage-700 transition-colors duration-200 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {exportingCSV ? <Spinner /> : <Download className="w-4 h-4" strokeWidth={1.75} />}
            Export CSV
          </button>
        </div>

        {exportError && (
          <p className="text-sm text-status-out mt-3">{exportError}</p>
        )}
      </div>
    </div>
  );
}
