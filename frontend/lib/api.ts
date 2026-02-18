const BASE_URL = "http://localhost:8060/api";

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

// Inventory
export function getInventory() {
  return apiFetch<unknown[]>("/inventory");
}

export function getInventoryItem(id: number) {
  return apiFetch<unknown>(`/inventory/${id}`);
}

// Velocity / reorder predictions
export function getVelocity() {
  return apiFetch<unknown[]>("/inventory/velocity");
}

// Shopping list
export function getShoppingList() {
  return apiFetch<unknown>("/shopping-list");
}

export function addShoppingListItem(item: { product_name: string; quantity?: number }) {
  return apiFetch<unknown>("/shopping-list/items", {
    method: "POST",
    body: JSON.stringify(item),
  });
}

export function checkShoppingListItem(itemId: number, checked: boolean) {
  return apiFetch<unknown>(`/shopping-list/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ checked }),
  });
}

// Meal planner
export function getMealSuggestions() {
  return apiFetch<unknown[]>("/meals/suggest");
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
  return apiFetch<unknown>("/classify", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}
