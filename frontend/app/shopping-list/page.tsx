"use client";

import React, { useEffect, useState, useRef } from "react";
import { ShoppingCart, Trash2 } from "lucide-react";
import { ErrorState, EmptyState } from "@/components/ui";
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
  const [copyLabel, setCopyLabel] = useState("Share List");
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
      // Backend may not have shopping list endpoints yet — treat as empty
      setLists([]);
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

  const activeList = lists.find((l) => l.id === activeListId) ?? null;

  // Separate auto vs manual items
  const autoItems = items.filter((i) => (i as ShoppingListItem & { source?: string }).source !== "manual");
  const manualItems = items.filter((i) => (i as ShoppingListItem & { source?: string }).source === "manual");
  const autoGrouped = groupByCategory(autoItems);
  const manualGrouped = groupByCategory(manualItems);

  async function handleCopyList() {
    const lines: string[] = [activeList!.name, ""];
    const allGrouped = groupByCategory(items);
    for (const [category, catItems] of Array.from(allGrouped.entries())) {
      lines.push(category);
      for (const item of catItems) {
        lines.push(`${item.checked ? "[x]" : "[ ]"} ${item.product_name} x${item.quantity}`);
      }
      lines.push("");
    }
    const text = lines.join("\n").trimEnd();

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for non-HTTPS or blocked clipboard permissions
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopyLabel("Copied!");
    setTimeout(() => setCopyLabel("Share List"), 2000);
  }

  return (
    <div className="flex flex-col h-full gap-6 animate-fade-in-up">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 flex-wrap mb-1">
          <h1 className="font-heading text-2xl text-warm-900 flex-1">Shopping Lists</h1>
          <button
            onClick={handleAutoGenerate}
            disabled={generating}
            className="border border-sage-300 text-sage-700 font-medium text-sm px-6 py-2.5 rounded-full hover:bg-sage-50 active:bg-sage-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
          >
            {generating ? "Generating…" : "Regenerate"}
          </button>
          <button
            onClick={() => {
              setShowNewList((v) => !v);
              setNewListName("");
            }}
            className="bg-sage-500 text-white font-medium text-sm px-6 py-2.5 rounded-full hover:bg-sage-600 active:bg-sage-700 transition-colors duration-200 shadow-sm"
          >
            New List
          </button>
        </div>
        <p className="text-warm-500 text-sm">Auto-generated and manual shopping lists.</p>
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
            className="flex-1 max-w-xs px-4 py-3 rounded-xl border border-warm-300 bg-white text-warm-800 text-sm placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-sage-200 focus:border-sage-400 transition-all duration-200"
          />
          <button
            onClick={handleCreateList}
            disabled={creatingList || !newListName.trim()}
            className="bg-sage-500 text-white font-medium text-sm px-5 py-2.5 rounded-full hover:bg-sage-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
          >
            {creatingList ? "Creating…" : "Confirm"}
          </button>
          <button
            onClick={() => { setShowNewList(false); setNewListName(""); }}
            className="text-warm-500 hover:text-warm-700 text-sm px-4 py-2.5 rounded-full hover:bg-warm-100 transition-colors duration-200"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && <ErrorState message={error} />}

      {/* Body: sidebar + main */}
      {loadingLists ? (
        <div className="animate-pulse space-y-2">
          <div className="h-10 bg-warm-200 rounded-xl w-40" />
          <div className="h-10 bg-warm-200 rounded-xl w-32" />
        </div>
      ) : lists.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center flex-1 gap-4 py-20 text-center">
          <ShoppingCart className="w-16 h-16 text-warm-300" strokeWidth={1.25} />
          <h3 className="font-heading text-xl text-warm-800">Your shopping list is empty</h3>
          <p className="text-sm text-warm-500 max-w-xs">
            Let us generate a smart list based on your pantry, or start one from scratch.
          </p>
          <div className="flex gap-3 flex-wrap justify-center">
            <button
              onClick={handleAutoGenerate}
              disabled={generating}
              className="bg-sage-500 text-white font-medium text-sm px-6 py-2.5 rounded-full hover:bg-sage-600 disabled:opacity-50 transition-colors duration-200 shadow-sm"
            >
              {generating ? "Generating…" : "Auto-Generate"}
            </button>
            <button
              onClick={() => setShowNewList(true)}
              className="border border-sage-300 text-sage-700 font-medium text-sm px-6 py-2.5 rounded-full hover:bg-sage-50 transition-colors duration-200"
            >
              New List
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-4 flex-1 min-h-0">
          {/* Sidebar — horizontal scroll tabs on mobile, vertical list on md+ */}
          <aside className="md:w-56 shrink-0 flex flex-nowrap overflow-x-auto md:flex-col gap-1 pb-1 md:pb-0">
            {lists.map((list) => (
              <button
                key={list.id}
                onClick={() => setActiveListId(list.id)}
                className={`shrink-0 text-left px-3 py-2.5 rounded-xl transition-colors duration-200 ${
                  list.id === activeListId
                    ? "bg-sage-50 text-sage-700"
                    : "text-warm-600 hover:bg-warm-100 hover:text-warm-800"
                }`}
              >
                <div className={`text-sm truncate ${list.id === activeListId ? "font-semibold" : "font-medium"}`}>
                  {list.name}
                </div>
                <div className="text-xs text-warm-500 mt-0.5">
                  {list.item_count ?? 0} item{list.item_count !== 1 ? "s" : ""}
                </div>
              </button>
            ))}
          </aside>

          {/* Main panel */}
          <main className="flex-1 min-w-0 flex flex-col gap-4">
            {loadingItems ? (
              <div className="animate-pulse space-y-3 bg-white rounded-2xl border border-linen p-6 shadow-card">
                <div className="h-4 bg-warm-200 rounded-lg w-1/3" />
                <div className="h-4 bg-warm-200 rounded-lg w-1/2" />
                <div className="h-4 bg-warm-200 rounded-lg w-2/5" />
              </div>
            ) : activeList ? (
              <>
                {/* List header */}
                <div className="flex items-center gap-3">
                  <div className="font-heading text-lg text-warm-800 flex-1">{activeList.name}</div>
                  {items.length >= 1 && (
                    <button
                      onClick={handleCopyList}
                      className="border border-sage-300 text-sage-700 font-medium text-sm px-5 py-2 rounded-full hover:bg-sage-50 active:bg-sage-100 transition-colors duration-200"
                    >
                      {copyLabel}
                    </button>
                  )}
                </div>

                {/* Item list */}
                {items.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-linen shadow-card">
                    <EmptyState compact icon={ShoppingCart} heading="No items yet" subtext="Add one below." />
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-linen p-6 shadow-card flex flex-col gap-0">

                    {/* Auto-generated section */}
                    {autoItems.length > 0 && (
                      <div>
                        <div className="font-heading text-lg text-warm-800 mb-3">Smart Picks</div>
                        {Array.from(autoGrouped.entries()).map(([category, catItems]) => (
                          <div key={category}>
                            <div className="text-xs font-medium text-warm-500 uppercase tracking-wide mt-4 mb-2 first:mt-0">
                              {category}
                            </div>
                            {catItems.map((item) => (
                              <ItemRow key={item.id} item={item} onCheck={handleCheck} onDelete={handleDelete} />
                            ))}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Divider between sections */}
                    {autoItems.length > 0 && manualItems.length > 0 && (
                      <div className="border-t border-linen my-4" />
                    )}

                    {/* Manual section */}
                    {manualItems.length > 0 && (
                      <div>
                        <div className="font-heading text-lg text-warm-800 mb-3">Added by You</div>
                        {Array.from(manualGrouped.entries()).map(([category, catItems]) => (
                          <div key={category}>
                            <div className="text-xs font-medium text-warm-500 uppercase tracking-wide mt-4 mb-2 first:mt-0">
                              {category}
                            </div>
                            {catItems.map((item) => (
                              <ItemRow key={item.id} item={item} onCheck={handleCheck} onDelete={handleDelete} />
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Add item row — stacks on mobile, row on sm+ */}
                <div className="flex flex-col sm:flex-row gap-2 mt-1">
                  <input
                    type="text"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddItem(); }}
                    placeholder="Add item…"
                    className="flex-1 px-4 py-3 rounded-xl border border-warm-300 bg-white text-warm-800 text-sm placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-sage-200 focus:border-sage-400 transition-all duration-200"
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={addQty}
                      min={1}
                      onChange={(e) => setAddQty(Math.max(1, Number(e.target.value)))}
                      className="w-16 px-2 py-3 rounded-xl border border-warm-300 bg-white text-warm-800 text-sm text-center focus:outline-none focus:ring-2 focus:ring-sage-200 focus:border-sage-400 transition-all duration-200"
                    />
                    <button
                      onClick={handleAddItem}
                      disabled={adding || !addName.trim()}
                      className="flex-1 sm:flex-none px-6 py-2.5 bg-sage-500 text-white font-medium text-sm rounded-full hover:bg-sage-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 shadow-sm"
                    >
                      {adding ? "Adding…" : "Add"}
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </main>
        </div>
      )}
    </div>
  );
}

// ─── Item Row ─────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  onCheck,
  onDelete,
}: {
  item: ShoppingListItem;
  onCheck: (item: ShoppingListItem) => void;
  onDelete: (item: ShoppingListItem) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-linen/50 last:border-0 group">
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={item.checked}
        onChange={() => onCheck(item)}
        className="w-4 h-4 accent-sage-500 cursor-pointer shrink-0"
      />
      {/* Name */}
      <span
        className={`flex-1 text-sm font-medium transition-colors ${
          item.checked
            ? "line-through text-warm-400 decoration-warm-300"
            : "text-warm-800"
        }`}
      >
        {item.product_name}
      </span>
      {/* Quantity */}
      <span className="text-sm text-warm-500 shrink-0">
        ×{item.quantity}
      </span>
      {/* Delete */}
      <button
        onClick={() => onDelete(item)}
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full text-warm-400 hover:text-status-out hover:bg-[#FDEAE5] transition-all duration-200 shrink-0"
        title="Remove item"
      >
        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
      </button>
    </div>
  );
}
