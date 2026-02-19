"use client";

import React, { useEffect, useState } from "react";
import { ChefHat, Bookmark } from "lucide-react";
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

// ─── Sage Spinners ────────────────────────────────────────────────────────────

function ButtonSpinner() {
  return (
    <svg
      className="w-4 h-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function SageSpinner({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <svg
        className="w-8 h-8 animate-spin text-sage-500"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <p className="text-warm-500 text-sm">{message}</p>
    </div>
  );
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
        <span className="text-xs text-status-fresh font-medium">{addedCount} items added ✓</span>
      ) : addState === "adding" ? (
        <span className="text-xs text-warm-500">Adding…</span>
      ) : (
        <>
          <span className="text-xs text-warm-500">Add missing to list:</span>
          {lists.length === 0 ? (
            <span className="text-xs text-warm-400">No lists available</span>
          ) : (
            <select
              value={selectedListId}
              onChange={handleListSelect}
              className="text-xs bg-white border border-sage-300 text-warm-700 rounded-full px-3 py-1 focus:outline-none focus:ring-1 focus:ring-sage-400"
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
    <div className="bg-white rounded-2xl border border-linen p-6 shadow-card flex flex-col gap-3">
      {/* Title + save */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-heading text-lg text-warm-900 leading-snug">{meal.title}</h3>
        <button
          onClick={handleSave}
          disabled={meal.id === null || saving}
          title={meal.saved ? "Saved" : "Save this meal"}
          className={`shrink-0 text-xs font-medium rounded-full px-3 py-1 transition-colors border ${
            meal.saved
              ? "text-sage-700 border-sage-300 bg-sage-50"
              : "text-sage-600 border-sage-200 hover:bg-sage-50"
          } disabled:opacity-30 disabled:cursor-not-allowed`}
        >
          {saving ? "Saving…" : meal.saved ? "Saved" : "Save"}
        </button>
      </div>

      {/* Ingredients */}
      {allIngredients.length > 0 && (
        <div className="flex flex-col gap-2">
          {hasSplit ? (
            <>
              {meal.availableIngredients.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-warm-500 mb-1.5">
                    In Your Pantry
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {meal.availableIngredients.map((ing, i) => (
                      <span
                        key={i}
                        className="bg-sage-50 text-sage-700 rounded-full px-3 py-1 text-xs font-medium"
                      >
                        {ing}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {meal.missingIngredients.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-warm-500 mb-1.5">
                    You&apos;ll Need
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {meal.missingIngredients.map((ing, i) => (
                      <span
                        key={i}
                        className="bg-terra-50 text-terra-700 rounded-full px-3 py-1 text-xs font-medium"
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
                  className="bg-sage-50 text-sage-700 rounded-full px-3 py-1 text-xs font-medium"
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
        <p className="text-warm-600 text-sm leading-relaxed">{meal.instructions}</p>
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
    <div className="bg-white rounded-2xl border border-linen p-5 shadow-card flex flex-col gap-2">
      {/* Title + bookmark */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-heading text-base text-warm-900 leading-snug">{title}</h3>
        <button
          onClick={handleSave}
          disabled={saving}
          title={record.saved ? "Saved" : "Save this meal"}
          className={`shrink-0 p-1 rounded transition-colors ${
            record.saved
              ? "text-sage-500"
              : "text-warm-400 hover:text-sage-500"
          }`}
        >
          <Bookmark
            className="w-4 h-4"
            strokeWidth={1.75}
            fill={record.saved ? "currentColor" : "none"}
          />
        </button>
      </div>

      {/* Ingredients */}
      {record.ingredients_used && record.ingredients_used.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {record.ingredients_used.map((ing, i) => (
            <span
              key={i}
              className="bg-sage-50 text-sage-700 rounded-full px-2.5 py-0.5 text-xs font-medium"
            >
              {ing}
            </span>
          ))}
        </div>
      )}

      {/* Instructions */}
      {instructions && (
        <p className="text-warm-600 text-xs leading-relaxed">{instructions}</p>
      )}

      {/* Date */}
      <div className="text-xs text-warm-400">
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
      <h1 className="font-heading text-2xl text-warm-900">Meal Planner</h1>

      {/* Tab bar */}
      <div className="flex overflow-x-auto flex-nowrap gap-1 border-b border-linen">
        {(["suggest", "history"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? "text-warm-900 border-sage-500"
                : "text-warm-500 border-transparent hover:text-warm-700"
            }`}
          >
            {t === "suggest" ? "Suggest" : "History"}
          </button>
        ))}
      </div>

      {/* ── Suggest tab ── */}
      {tab === "suggest" && (
        <div className="flex flex-col gap-4">
          {/* Generate button */}
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleSuggest}
              disabled={suggesting}
              className="w-full sm:w-auto bg-sage-500 hover:bg-sage-600 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-full px-6 py-2.5 transition-colors flex items-center justify-center gap-2"
            >
              {suggesting ? (
                <ButtonSpinner />
              ) : (
                <ChefHat className="w-4 h-4" strokeWidth={1.75} />
              )}
              {suggesting ? "Thinking…" : "Get Suggestions"}
            </button>
          </div>

          {suggestError && (
            <div className="text-sm text-status-out bg-[#FDEAE5] border border-[#E8C4BB] rounded-xl px-4 py-3">
              {suggestError}
            </div>
          )}

          {/* Loading state during generation */}
          {suggesting && (
            <SageSpinner message="Finding the perfect meals for your pantry…" />
          )}

          {!suggesting && suggestions.length > 0 && (
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

          {/* Empty state */}
          {!suggesting && suggestions.length === 0 && !suggestError && (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <ChefHat className="w-16 h-16 text-warm-300" strokeWidth={1.25} />
              <div>
                <p className="font-heading text-xl text-warm-700 mb-1">What shall we cook?</p>
                <p className="text-warm-500 text-sm">
                  Tap &ldquo;Get Suggestions&rdquo; and we&apos;ll find delicious meals
                  <br className="hidden sm:inline" /> you can make with what&apos;s already in your pantry.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── History tab ── */}
      {tab === "history" && (
        <div className="flex flex-col gap-4">
          {loadingHistory && (
            <SageSpinner message="Loading your meal history…" />
          )}

          {historyError && (
            <div className="text-sm text-status-out bg-[#FDEAE5] border border-[#E8C4BB] rounded-xl px-4 py-3">
              {historyError}
            </div>
          )}

          {!loadingHistory && !historyError && history.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <ChefHat className="w-16 h-16 text-warm-300" strokeWidth={1.25} />
              <div>
                <p className="font-heading text-xl text-warm-700 mb-1">No history yet</p>
                <p className="text-warm-500 text-sm">
                  Generate some suggestions in the Suggest tab to build your meal history.
                </p>
              </div>
            </div>
          )}

          {history.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
