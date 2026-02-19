"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  getShoppingLists,
  getShoppingList,
  createShoppingList,
  generateShoppingList,
  addShoppingListItem,
  updateShoppingListItem,
  deleteShoppingListItem,
  ShoppingList,
  ShoppingListItem,
} from "@/lib/api";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupByCategory(items: ShoppingListItem[]): Map<string, ShoppingListItem[]> {
  const sorted = [...items].sort((a, b) => {
    const ca = (a as ShoppingListItem & { category?: string }).category ?? "Other";
    const cb = (b as ShoppingListItem & { category?: string }).category ?? "Other";
    if (ca !== cb) return ca.localeCompare(cb);
    return a.product_name.localeCompare(b.product_name);
  });
  const map = new Map<string, ShoppingListItem[]>();
  for (const item of sorted) {
    const cat = (item as ShoppingListItem & { category?: string }).category ?? "Other";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(item);
  }
  return map;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ShoppingListPage() {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [activeListId, setActiveListId] = useState<number | null>(null);
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const [addName, setAddName] = useState("");
  const [addQty, setAddQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newListInputRef = useRef<HTMLInputElement>(null);

  // Load all lists on mount
  useEffect(() => {
    loadLists();
  }, []);

  // Focus new list input when shown
  useEffect(() => {
    if (showNewList) newListInputRef.current?.focus();
  }, [showNewList]);

  // Load items when active list changes
  useEffect(() => {
    if (activeListId === null) {
      setItems([]);
      return;
    }
    setLoadingItems(true);
    setError(null);
    getShoppingList(activeListId)
      .then(({ items: fetchedItems }) => setItems(fetchedItems))
      .catch(() => setError("Failed to load items."))
      .finally(() => setLoadingItems(false));
  }, [activeListId]);

  async function loadLists(selectId?: number) {
    setLoadingLists(true);
    try {
      const fetched = await getShoppingLists();
      setLists(fetched);
      if (selectId !== undefined) {
        setActiveListId(selectId);
      } else if (fetched.length > 0 && activeListId === null) {
        setActiveListId(fetched[0].id);
      }
    } catch {
      setError("Failed to load lists.");
    } finally {
      setLoadingLists(false);
    }
  }

  async function handleAutoGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const result = await generateShoppingList();
      await loadLists(result.id);
    } catch {
      setError("Auto-generate failed.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCreateList() {
    const name = newListName.trim();
    if (!name) return;
    setCreatingList(true);
    setError(null);
    try {
      const created = await createShoppingList(name);
      setNewListName("");
      setShowNewList(false);
      await loadLists(created.id);
    } catch {
      setError("Failed to create list.");
    } finally {
      setCreatingList(false);
    }
  }

  async function handleCheck(item: ShoppingListItem) {
    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i))
    );
    try {
      await updateShoppingListItem(item.list_id, item.id, { checked: !item.checked });
    } catch {
      // Revert on failure
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, checked: item.checked } : i))
      );
    }
  }

  async function handleDelete(item: ShoppingListItem) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    try {
      await deleteShoppingListItem(item.list_id, item.id);
    } catch {
      // Restore on failure
      setItems((prev) => [...prev, item].sort((a, b) => a.id - b.id));
    }
  }

  async function handleAddItem() {
    if (!activeListId || !addName.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const newItem = await addShoppingListItem(activeListId, {
        product_name: addName.trim(),
        quantity: addQty,
        source: "manual",
      });
      setItems((prev) => [...prev, newItem]);
      setAddName("");
      setAddQty(1);
      // Update item_count in sidebar
      setLists((prev) =>
        prev.map((l) =>
          l.id === activeListId
            ? { ...l, item_count: (l.item_count ?? 0) + 1 }
            : l
        )
      );
    } catch {
      setError("Failed to add item.");
    } finally {
      setAdding(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const grouped = groupByCategory(items);
  const activeList = lists.find((l) => l.id === activeListId) ?? null;

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-zinc-100 flex-1">Shopping Lists</h1>
        <button
          onClick={handleAutoGenerate}
          disabled={generating}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {generating ? "Generating…" : "Auto-Generate"}
        </button>
        <button
          onClick={() => {
            setShowNewList((v) => !v);
            setNewListName("");
          }}
          className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-100 text-sm font-medium rounded-lg transition-colors"
        >
          New List
        </button>
      </div>

      {/* Inline new-list form */}
      {showNewList && (
        <div className="flex items-center gap-2">
          <input
            ref={newListInputRef}
            type="text"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateList();
              if (e.key === "Escape") { setShowNewList(false); setNewListName(""); }
            }}
            placeholder="List name…"
            className="flex-1 max-w-xs bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          <button
            onClick={handleCreateList}
            disabled={creatingList || !newListName.trim()}
            className="px-3 py-2 bg-zinc-600 hover:bg-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-100 text-sm rounded-lg transition-colors"
          >
            {creatingList ? "Creating…" : "Confirm"}
          </button>
          <button
            onClick={() => { setShowNewList(false); setNewListName(""); }}
            className="px-3 py-2 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {/* Body: sidebar + main */}
      {loadingLists ? (
        <p className="text-zinc-500 text-sm">Loading lists…</p>
      ) : lists.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center flex-1 gap-4 py-20 text-center">
          <p className="text-zinc-400 text-lg">No shopping lists yet.</p>
          <p className="text-zinc-500 text-sm">
            Auto-generate a list based on your inventory, or create one manually.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleAutoGenerate}
              disabled={generating}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {generating ? "Generating…" : "Auto-Generate"}
            </button>
            <button
              onClick={() => setShowNewList(true)}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-100 text-sm font-medium rounded-lg transition-colors"
            >
              New List
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Sidebar */}
          <aside className="w-56 shrink-0 flex flex-col gap-1">
            {lists.map((list) => (
              <button
                key={list.id}
                onClick={() => setActiveListId(list.id)}
                className={`text-left px-3 py-2.5 rounded-lg transition-colors ${
                  list.id === activeListId
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                <div className="text-sm font-medium truncate">{list.name}</div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {list.item_count ?? 0} item{list.item_count !== 1 ? "s" : ""}
                </div>
              </button>
            ))}
          </aside>

          {/* Main panel */}
          <main className="flex-1 min-w-0 flex flex-col gap-4">
            {loadingItems ? (
              <p className="text-zinc-500 text-sm">Loading items…</p>
            ) : activeList ? (
              <>
                <div className="text-zinc-300 font-semibold text-base">{activeList.name}</div>

                {/* Item list grouped by category */}
                {items.length === 0 ? (
                  <p className="text-zinc-500 text-sm">No items. Add one below.</p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {Array.from(grouped.entries()).map(([category, catItems]) => (
                      <div key={category}>
                        {/* Sticky category label */}
                        <div className="sticky top-0 bg-zinc-900 z-10 text-xs font-semibold uppercase tracking-wider text-zinc-500 py-1 mb-1 border-b border-zinc-800">
                          {category}
                        </div>
                        <div className="flex flex-col gap-0.5">
                          {catItems.map((item) => (
                            <div
                              key={item.id}
                              className={`flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-zinc-800/50 group transition-colors ${
                                item.checked ? "opacity-50" : ""
                              }`}
                            >
                              {/* Checkbox */}
                              <input
                                type="checkbox"
                                checked={item.checked}
                                onChange={() => handleCheck(item)}
                                className="w-4 h-4 accent-emerald-500 cursor-pointer shrink-0"
                              />
                              {/* Name */}
                              <span
                                className={`flex-1 text-sm text-zinc-200 ${
                                  item.checked ? "line-through text-zinc-500" : ""
                                }`}
                              >
                                {item.product_name}
                              </span>
                              {/* Quantity */}
                              <span className="text-xs text-zinc-500 shrink-0">
                                x{item.quantity}
                              </span>
                              {/* Delete */}
                              <button
                                onClick={() => handleDelete(item)}
                                className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all shrink-0"
                                title="Remove item"
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add item row */}
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddItem(); }}
                    placeholder="Add item…"
                    className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
                  />
                  <input
                    type="number"
                    value={addQty}
                    min={1}
                    onChange={(e) => setAddQty(Math.max(1, Number(e.target.value)))}
                    className="w-16 bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-zinc-500"
                  />
                  <button
                    onClick={handleAddItem}
                    disabled={adding || !addName.trim()}
                    className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-100 text-sm rounded-lg transition-colors"
                  >
                    {adding ? "Adding…" : "Add"}
                  </button>
                </div>
              </>
            ) : null}
          </main>
        </div>
      )}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}
