const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8060/api";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// Inventory (velocity-based)
export function getInventory() {
  return apiFetch<unknown[]>("/inventory");
}

export function getLowInventory() {
  return apiFetch<unknown[]>("/inventory/low");
}

// Shopping list types
export type ShoppingList = {
  id: number;
  name: string;
  created_at: string;
  completed_at: string | null;
  item_count?: number;
};

export type ShoppingListItem = {
  id: number;
  list_id: number;
  product_id: number | null;
  product_name: string;
  quantity: number;
  checked: boolean;
  source: string;
};

// Shopping list
export function getShoppingLists(): Promise<ShoppingList[]> {
  return apiFetch<ShoppingList[]>("/shopping-lists");
}

export function createShoppingList(name: string): Promise<ShoppingList> {
  return apiFetch<ShoppingList>("/shopping-lists", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function getShoppingList(id: number): Promise<{ list: ShoppingList; items: ShoppingListItem[] }> {
  return apiFetch<{ list: ShoppingList; items: ShoppingListItem[] }>(`/shopping-lists/${id}`);
}

export function deleteShoppingList(id: number): Promise<void> {
  return fetch(`${BASE_URL}/shopping-lists/${id}`, {
    method: "DELETE",
  }).then((res) => {
    if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  });
}

export function generateShoppingList(): Promise<{ id: number; name: string; item_count: number }> {
  return apiFetch<{ id: number; name: string; item_count: number }>("/shopping-lists/generate", {
    method: "POST",
  });
}

export function addShoppingListItem(
  listId: number,
  item: { product_name: string; quantity?: number; product_id?: number; source?: string }
): Promise<ShoppingListItem> {
  return apiFetch<ShoppingListItem>(`/shopping-lists/${listId}/items`, {
    method: "POST",
    body: JSON.stringify(item),
  });
}

export function updateShoppingListItem(
  listId: number,
  itemId: number,
  update: { checked?: boolean; quantity?: number; product_name?: string }
): Promise<ShoppingListItem> {
  return apiFetch<ShoppingListItem>(`/shopping-lists/${listId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(update),
  });
}

export function deleteShoppingListItem(listId: number, itemId: number): Promise<void> {
  return fetch(`${BASE_URL}/shopping-lists/${listId}/items/${itemId}`, {
    method: "DELETE",
  }).then((res) => {
    if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  });
}

// Meal planner
export function suggestMeals(preferences?: string, count: number = 5) {
  return apiFetch<{ suggestions: unknown[] }>("/meals/suggest", {
    method: "POST",
    body: JSON.stringify({ preferences, count }),
  });
}

// Receipts
export function getReceipts() {
  return apiFetch<unknown[]>("/receipts");
}

export function uploadReceipt(formData: FormData) {
  return fetch(`${BASE_URL}/receipts/upload`, {
    method: "POST",
    body: formData,
  }).then((res) => {
    if (!res.ok) throw new Error(`Upload error ${res.status}: ${res.statusText}`);
    return res.json();
  });
}

// Spending
export function getSpending(months?: number) {
  const qs = months ? `?months=${months}` : "";
  return apiFetch<unknown>(`/spending${qs}`);
}

// Settings
export function getSettings() {
  return apiFetch<Record<string, string>>("/settings");
}

export function updateSetting(key: string, value: string) {
  return apiFetch<unknown>(`/settings/${key}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
}

// Classifier
export function classifyItem(name: string) {
  return apiFetch<{ canonical_name: string; category: string; consumption_profile: string }>("/classify", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}
