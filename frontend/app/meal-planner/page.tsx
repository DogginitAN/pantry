"use client";

import React, { useEffect, useState } from "react";
import {
  suggestMeals,
  getMealSuggestions,
  saveMealSuggestion,
  addMealIngredientsToList,
  getShoppingLists,
  MealSuggestion,
  ShoppingList,
} from "@/lib/api";

type Tab = "suggest" | "history";

type SuggestedMeal = {
  id: number | null;
  title: string;
  availableIngredients: string[];
  missingIngredients: string[];
  instructions: string;
  saved: boolean;
};

function parseHistoryMeal(record: MealSuggestion): { title: string; instructions: string } {
  const idx = record.suggestion_text.indexOf("\n\n");
  if (idx === -1) return { title: record.suggestion_text, instructions: "" };
  return {
    title: record.suggestion_text.slice(0, idx),
    instructions: record.suggestion_text.slice(idx + 2),
  };
}

// ─── Add-to-list widget ───────────────────────────────────────────────────────

function AddToListWidget({
  mealId,
  ingredients,
  lists,
}: {
  mealId: number;
  ingredients: string[];
  lists: ShoppingList[];
}) {
  const [addState, setAddState] = useState<"idle" | "adding" | "done">("idle");
  const [addedCount, setAddedCount] = useState(0);
  const [selectedListId, setSelectedListId] = useState("");

  if (ingredients.length === 0) return null;

  async function handleListSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    setSelectedListId("");
    if (!val) return;
    setAddState("adding");
    try {
      const result = await addMealIngredientsToList(
        mealId,
        Number(val),
        ingredients.map((name) => ({ name, quantity: "1" }))
      );
      setAddedCount(result.added);
      setAddState("done");
      setTimeout(() => setAddState("idle"), 3000);
    } catch {
      setAddState("idle");
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {addState === "done" ? (
        <span className="text-xs text-emerald-400">{addedCount} items added ✓</span>
      ) : addState === "adding" ? (
        <span className="text-xs text-zinc-400">Adding…</span>
      ) : (
        <>
          <span className="text-xs text-zinc-400">Add missing to list:</span>
          {lists.length === 0 ? (
            <span className="text-xs text-zinc-500">No lists available</span>
          ) : (
            <select
              value={selectedListId}
              onChange={handleListSelect}
              className="text-xs bg-zinc-700 border border-zinc-600 text-zinc-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            >
              <option value="">Select list…</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
        </>
      )}
    </div>
  );
}

// ─── Suggest Meal Card ────────────────────────────────────────────────────────

function SuggestMealCard({
  meal,
  lists,
  onSave,
}: {
  meal: SuggestedMeal;
  lists: ShoppingList[];
  onSave: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (meal.id === null || saving) return;
    setSaving(true);
    try {
      await onSave();
    } catch {
      // ignore — parent handles state update
    } finally {
      setSaving(false);
    }
  }

  const hasSplit =
    meal.availableIngredients.length > 0 || meal.missingIngredients.length > 0;
  const allIngredients = [...meal.availableIngredients, ...meal.missingIngredients];
  const addIngredients =
    meal.missingIngredients.length > 0 ? meal.missingIngredients : allIngredients;

  return (
    <div className="bg-zinc-800 rounded-xl p-5 flex flex-col gap-3">
      {/* Title + save */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-zinc-100 font-bold text-base leading-snug">{meal.title}</h3>
        <button
          onClick={handleSave}
          disabled={meal.id === null || saving}
          title={meal.saved ? "Saved" : "Save this meal"}
          className={`shrink-0 p-1 rounded transition-colors ${
            meal.saved
              ? "text-rose-400 hover:text-rose-300"
              : "text-zinc-500 hover:text-rose-400"
          } disabled:opacity-30 disabled:cursor-not-allowed`}
        >
          <HeartIcon filled={meal.saved} />
        </button>
      </div>

      {/* Ingredients */}
      {allIngredients.length > 0 && (
        <div className="flex flex-col gap-2">
          {hasSplit ? (
            <>
              {meal.availableIngredients.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-500 mb-1">
                    In Your Pantry
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {meal.availableIngredients.map((ing, i) => (
                      <span
                        key={i}
                        className="text-xs bg-emerald-900/40 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-800/50"
                      >
                        {ing}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {meal.missingIngredients.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-500 mb-1">
                    You&apos;ll Need
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {meal.missingIngredients.map((ing, i) => (
                      <span
                        key={i}
                        className="text-xs bg-amber-900/40 text-amber-300 px-2 py-0.5 rounded-full border border-amber-800/50"
                      >
                        {ing}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {allIngredients.map((ing, i) => (
                <span
                  key={i}
                  className="text-xs bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded-full"
                >
                  {ing}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      {meal.instructions && (
        <p className="text-xs text-zinc-400 leading-relaxed">{meal.instructions}</p>
      )}

      {/* Add to list */}
      {meal.id !== null && addIngredients.length > 0 && (
        <AddToListWidget mealId={meal.id} ingredients={addIngredients} lists={lists} />
      )}
    </div>
  );
}

// ─── History Meal Card ────────────────────────────────────────────────────────

function HistoryMealCard({
  record,
  onSave,
}: {
  record: MealSuggestion;
  onSave: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const { title, instructions } = parseHistoryMeal(record);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-zinc-800 rounded-xl p-5 flex flex-col gap-3">
      {/* Title + save */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-zinc-100 font-bold text-base leading-snug">{title}</h3>
        <button
          onClick={handleSave}
          disabled={saving}
          title={record.saved ? "Saved" : "Save this meal"}
          className={`shrink-0 p-1 rounded transition-colors ${
            record.saved
              ? "text-rose-400 hover:text-rose-300"
              : "text-zinc-500 hover:text-rose-400"
          }`}
        >
          <HeartIcon filled={record.saved} />
        </button>
      </div>

      {/* Ingredients */}
      {record.ingredients_used && record.ingredients_used.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {record.ingredients_used.map((ing, i) => (
            <span
              key={i}
              className="text-xs bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded-full"
            >
              {ing}
            </span>
          ))}
        </div>
      )}

      {/* Instructions */}
      {instructions && (
        <p className="text-xs text-zinc-400 leading-relaxed">{instructions}</p>
      )}

      {/* Date */}
      <div className="text-xs text-zinc-600">
        {new Date(record.created_at).toLocaleDateString()}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MealPlannerPage() {
  const [tab, setTab] = useState<Tab>("suggest");

  // Suggest tab
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedMeal[]>([]);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  // History tab — lazy loaded on first switch
  const [history, setHistory] = useState<MealSuggestion[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Shopping lists for add-to-list widget
  const [lists, setLists] = useState<ShoppingList[]>([]);

  // Load shopping lists once on mount
  useEffect(() => {
    getShoppingLists().then(setLists).catch(() => {});
  }, []);

  // Lazy-load history on first "history" tab visit
  useEffect(() => {
    if (tab === "history" && !historyLoaded) {
      setLoadingHistory(true);
      setHistoryError(null);
      getMealSuggestions()
        .then((data) => {
          setHistory(data);
          setHistoryLoaded(true);
        })
        .catch(() => setHistoryError("Failed to load history."))
        .finally(() => setLoadingHistory(false));
    }
  }, [tab, historyLoaded]);

  async function handleSuggest() {
    setSuggesting(true);
    setSuggestError(null);
    try {
      const data = await suggestMeals();
      setSuggestions(
        data.suggestions.map((s) => ({
          id: s.id,
          title: s.title,
          availableIngredients: s.available_ingredients,
          missingIngredients: s.missing_ingredients,
          instructions: s.instructions,
          saved: false,
        }))
      );
    } catch {
      setSuggestError(
        "Failed to get suggestions. The AI may be unavailable or still warming up."
      );
    } finally {
      setSuggesting(false);
    }
  }

  async function handleSaveSuggestion(index: number) {
    const meal = suggestions[index];
    if (meal.id === null) return;
    await saveMealSuggestion(meal.id);
    setSuggestions((prev) =>
      prev.map((s, i) => (i === index ? { ...s, saved: !s.saved } : s))
    );
  }

  async function handleSaveHistory(index: number) {
    const record = history[index];
    const updated = await saveMealSuggestion(record.id);
    setHistory((prev) =>
      prev.map((h, i) => (i === index ? { ...h, saved: updated.saved } : h))
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-zinc-100">Meal Planner</h1>

      {/* Tab bar — overflow-x-auto so tabs don't cause horizontal page scroll */}
      <div className="flex overflow-x-auto flex-nowrap gap-1 border-b border-zinc-800">
        {(["suggest", "history"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? "text-zinc-100 border-emerald-500"
                : "text-zinc-400 border-transparent hover:text-zinc-200"
            }`}
          >
            {t === "suggest" ? "Suggest" : "History"}
          </button>
        ))}
      </div>

      {/* ── Suggest tab ── */}
      {tab === "suggest" && (
        <div className="flex flex-col gap-4">
          {/* Button row — flex-col on mobile so button is full-width, sm:flex-row for side-by-side if more controls are added */}
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleSuggest}
              disabled={suggesting}
              className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {suggesting && <SpinnerIcon />}
              {suggesting ? "Thinking…" : "Get Suggestions"}
            </button>
          </div>

          {suggestError && (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-4 py-2">
              {suggestError}
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {suggestions.map((meal, i) => (
                <SuggestMealCard
                  key={i}
                  meal={meal}
                  lists={lists}
                  onSave={() => handleSaveSuggestion(i)}
                />
              ))}
            </div>
          )}

          {!suggesting && suggestions.length === 0 && !suggestError && (
            <p className="text-zinc-500 text-sm">
              Click &ldquo;Get Suggestions&rdquo; to generate meal ideas from your pantry
              inventory.
            </p>
          )}
        </div>
      )}

      {/* ── History tab ── */}
      {tab === "history" && (
        <div className="flex flex-col gap-4">
          {loadingHistory && (
            <p className="text-zinc-500 text-sm">Loading history…</p>
          )}

          {historyError && (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-4 py-2">
              {historyError}
            </div>
          )}

          {!loadingHistory && !historyError && history.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <p className="text-zinc-400 text-lg">No meal history yet.</p>
              <p className="text-zinc-500 text-sm">
                Generate some suggestions in the Suggest tab to build your history.
              </p>
            </div>
          )}

          {history.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {history.map((record, i) => (
                <HistoryMealCard
                  key={record.id}
                  record={record}
                  onSave={() => handleSaveHistory(i)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-5 h-5"
      fill={filled ? "currentColor" : "none"}
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="w-4 h-4 animate-spin"
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
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
