"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SHOPPING_CATEGORIES,
  SHOPPING_CATEGORY_AT,
  type ShoppingCategory,
  type ShoppingItem,
} from "@/lib/shopping";

type Props = {
  editCode: string;
  onError: (message: string | null) => void;
};

export default function ShoppingList({ editCode, onError }: Props) {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<ShoppingCategory, string>>({
    fresh: "",
    seafood: "",
    chilled: "",
    pantry: "",
  });

  const headers = useCallback((): HeadersInit => {
    return {
      "content-type": "application/json",
      "x-edit-code": editCode,
    };
  }, [editCode]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/shopping", {
        cache: "no-store",
        headers: { "x-edit-code": editCode },
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(j?.error || "Einkaufsliste konnte nicht geladen werden");
      }
      const data = (await res.json()) as { items: ShoppingItem[] };
      setItems(data.items ?? []);
      onError(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Ladefehler");
    } finally {
      setLoading(false);
    }
  }, [editCode, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const byCategory = useMemo(() => {
    const map = new Map<ShoppingCategory, ShoppingItem[]>();
    for (const cat of SHOPPING_CATEGORIES) map.set(cat, []);
    for (const item of items) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return map;
  }, [items]);

  async function addItem(category: ShoppingCategory) {
    const label = drafts[category].trim();
    if (!label || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/shopping", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ category, label }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(j?.error || "Hinzufügen fehlgeschlagen");
      }
      setDrafts((d) => ({ ...d, [category]: "" }));
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function toggleDone(item: ShoppingItem) {
    setBusy(true);
    try {
      const res = await fetch("/api/shopping", {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ id: item.id, done: !item.done }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(j?.error || "Aktualisieren fehlgeschlagen");
      }
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id: number) {
    if (!confirm("Diesen Eintrag löschen?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/shopping?id=${id}`, {
        method: "DELETE",
        headers: { "x-edit-code": editCode },
      });
      if (!res.ok && res.status !== 204) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(j?.error || "Löschen fehlgeschlagen");
      }
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="anim-rise shopping-board mb-6 p-3 sm:p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="brand-title text-2xl sm:text-3xl">Einkaufsliste</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            Vier Spalten wie in der Küche — abhaken oder neue Dinge ergänzen.
          </p>
        </div>
        {loading ? (
          <span className="text-sm text-[var(--ink-soft)]">Laden…</span>
        ) : null}
      </div>

      <div className="shopping-grid">
        {SHOPPING_CATEGORIES.map((category) => {
          const meta = SHOPPING_CATEGORY_AT[category];
          const list = byCategory.get(category) ?? [];
          return (
            <div key={category} className="shopping-col">
              <div className="shopping-col-head">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">
                  {meta.title}
                </p>
                <p className="text-[11px] text-[var(--ink-soft)]">{meta.short}</p>
              </div>
              <ul className="shopping-rows">
                {list.map((item) => (
                  <li key={item.id} className="shopping-row">
                    <button
                      type="button"
                      className={`shopping-label ${item.done ? "is-done" : ""}`}
                      onClick={() => void toggleDone(item)}
                      disabled={busy}
                    >
                      {item.label}
                    </button>
                    <button
                      type="button"
                      className="shopping-del"
                      aria-label={`${item.label} löschen`}
                      onClick={() => void removeItem(item.id)}
                      disabled={busy}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <form
                className="shopping-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  void addItem(category);
                }}
              >
                <input
                  className="field shopping-add-field"
                  value={drafts[category]}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [category]: e.target.value }))
                  }
                  placeholder="+ Neu"
                  disabled={busy}
                  aria-label={`Neue Ware in ${meta.title}`}
                />
                <button
                  type="submit"
                  className="btn btn-ghost shopping-add-btn"
                  disabled={busy || !drafts[category].trim()}
                >
                  +
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </section>
  );
}
