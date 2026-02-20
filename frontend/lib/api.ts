const BASE_URL = "/api";

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

// Meal planner types
export type MealSuggestion = {
  id: number;
  suggestion_text: string;
  ingredients_used: string[] | null;
  saved: boolean;
  created_at: string;
};

export type MealIngredient = {
  name: string;
  quantity: string;
};

// Meal planner
export function suggestMeals(preferences?: string, count: number = 5) {
  return apiFetch<{
    suggestions: Array<{
      id: number | null;
      title: string;
      available_ingredients: string[];
      missing_ingredients: string[];
      ingredients: string[];
      instructions: string;
    }>;
  }>("/meals/suggest", {
    method: "POST",
    body: JSON.stringify({ preferences, count }),
  });
}

export function getMealSuggestions(): Promise<MealSuggestion[]> {
  return apiFetch<MealSuggestion[]>("/meals/suggestions");
}

export function saveMealSuggestion(id: number): Promise<MealSuggestion> {
  return apiFetch<MealSuggestion>(`/meals/suggestions/${id}/save`, {
    method: "PATCH",
  });
}

export function addMealIngredientsToList(
  suggestionId: number,
  listId: number,
  ingredients: MealIngredient[]
): Promise<{ added: number }> {
  return apiFetch<{ added: number }>(`/meals/suggestions/${suggestionId}/add-to-list`, {
    method: "POST",
    body: JSON.stringify({ list_id: listId, ingredients }),
  });
}

// Receipt types
export type Receipt = {
  id: number;
  store_name: string | null;
  receipt_date: string | null;
  total_amount: number | null;
  processing_status: string;
  created_at: string;
  image_path: string | null;
};

export type ReceiptItem = {
  id: number;
  product_name: string;
  quantity: number | null;
  unit_price: number | null;
  total_price: number | null;
  confidence: number | null;
};

// Receipts
export function getReceipts(): Promise<Receipt[]> {
  return apiFetch<Receipt[]>("/receipts");
}

export function getReceipt(id: number): Promise<{ receipt: Receipt; items: ReceiptItem[] }> {
  return apiFetch<{ receipt: Receipt; items: ReceiptItem[] }>(`/receipts/${id}`);
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

// Spending analytics types
export type MonthlySpend = {
  month: string;
  total: number;
  receipt_count: number;
};

export type CategorySpend = {
  category: string;
  total: number;
  item_count: number;
  pct_of_total: number;
};

export type TopItem = {
  canonical_name: string;
  category: string;
  total_spend: number;
  purchase_count: number;
};

export type BudgetSettings = {
  monthly_budget: number | null;
};

// Spending analytics
export function getMonthlySpending(): Promise<MonthlySpend[]> {
  return apiFetch<MonthlySpend[]>("/spending/monthly");
}

export function getCategorySpending(): Promise<CategorySpend[]> {
  return apiFetch<CategorySpend[]>("/spending/by-category");
}

export function getTopItems(limit?: number): Promise<TopItem[]> {
  const qs = limit !== undefined ? `?limit=${limit}` : "";
  return apiFetch<TopItem[]>(`/spending/top-items${qs}`);
}

export function getBudget(): Promise<BudgetSettings> {
  return apiFetch<BudgetSettings>("/settings/budget");
}

export function setBudget(monthly_budget: number | null): Promise<BudgetSettings> {
  return apiFetch<BudgetSettings>("/settings/budget", {
    method: "PATCH",
    body: JSON.stringify({ monthly_budget }),
  });
}

// Classifier
export function classifyItem(name: string) {
  return apiFetch<{ canonical_name: string; category: string; consumption_profile: string }>("/classify", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

// AI provider settings
export type AISettings = {
  provider: "local" | "cloud";
  ollama_base_url: string;
  ollama_model: string;
  cloud_model: string;
};

export function getAISettings(): Promise<AISettings> {
  return apiFetch<AISettings>("/settings/ai-provider");
}

export function updateAISettings(patch: Partial<AISettings>): Promise<AISettings> {
  return apiFetch<AISettings>("/settings/ai-provider", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

// Data export
export async function exportJSON(): Promise<void> {
  const res = await fetch(`${BASE_URL}/export/json`);
  if (!res.ok) throw new Error(`Export error ${res.status}: ${res.statusText}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pantry_export.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export async function exportCSV(): Promise<void> {
  const res = await fetch(`${BASE_URL}/export/csv`);
  if (!res.ok) throw new Error(`Export error ${res.status}: ${res.statusText}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pantry_export.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
