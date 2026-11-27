"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SHOPPING_CATEGORIES,
  SHOPPING_CATEGORY_AT,
  type ShoppingCategory,
  type ShoppingItem,
} from "@/lib/shopping";

type Props = {
  open: boolean;
  editCode: string;
  onClose: () => void;
  onError: (message: string | null) => void;
};

export default function ShoppingList({
  open,
  editCode,
  onClose,
  onError,
}: Props) {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [category, setCategory] = useState<ShoppingCategory>("fresh");
  const [draft, setDraft] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );

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
    if (!open) return;
    void load();
  }, [open, load]);

  const selected = useMemo(
    () => items.filter((i) => i.done).sort((a, b) => a.label.localeCompare(b.label, "de")),
    [items],
  );

  const catalog = useMemo(
    () =>
      items
        .filter((i) => i.category === category)
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
    [items, category],
  );

  async function toggleSelected(item: ShoppingItem) {
    if (busyId != null) return;
    const next = !item.done;
    setItems((prev) =>
      prev.map((row) => (row.id === item.id ? { ...row, done: next } : row)),
    );
    setBusyId(item.id);
    try {
      const res = await fetch("/api/shopping", {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ id: item.id, done: next }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(j?.error || "Aktualisieren fehlgeschlagen");
      }
      const updated = (await res.json()) as ShoppingItem;
      setItems((prev) =>
        prev.map((row) => (row.id === updated.id ? updated : row)),
      );
    } catch (e) {
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id ? { ...row, done: item.done } : row,
        ),
      );
      onError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusyId(null);
    }
  }

  async function addItem() {
    const label = draft.trim();
    if (!label || busyId != null) return;
    setBusyId(-1);
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
      const created = (await res.json()) as ShoppingItem;
      setItems((prev) => [...prev, created]);
      setDraft("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusyId(null);
    }
  }

  async function clearSelected() {
    if (selected.length === 0) return;
    if (!confirm("Alle markierten Positionen vom Zettel nehmen?")) return;
    setBusyId(-2);
    try {
      await Promise.all(
        selected.map(async (item) => {
          const res = await fetch("/api/shopping", {
            method: "PATCH",
            headers: headers(),
            body: JSON.stringify({ id: item.id, done: false }),
          });
          if (!res.ok) throw new Error("Zurücksetzen fehlgeschlagen");
        }),
      );
      setItems((prev) => prev.map((row) => ({ ...row, done: false })));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Fehler");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function zettelText() {
    return [
      "Einkaufsliste — Fitz",
      ...selected.map((item) => `• ${item.label}`),
    ].join("\n");
  }

  async function copyZettel() {
    if (selected.length === 0) return;
    const text = zettelText();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.left = "-9999px";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("error");
      onError("Kopieren fehlgeschlagen");
      window.setTimeout(() => setCopyState("idle"), 2000);
    }
  }

  async function shareZettel() {
    if (selected.length === 0) return;
    const text = zettelText();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Einkaufsliste", text });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    await copyZettel();
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop shopping-sheet-backdrop" role="dialog" aria-modal="true">
      <div className="modal-sheet shopping-sheet">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="brand-title text-3xl">Einkauf</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Antippen → grün → auf dem Zettel.
            </p>
          </div>
          <button type="button" className="btn btn-ghost px-3 text-sm" onClick={onClose}>
            Schließen
          </button>
        </div>

        <div className="shopping-zettel mb-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">
              Auf dem Zettel ({selected.length})
            </p>
            {selected.length > 0 ? (
              <button
                type="button"
                className="text-xs font-semibold text-[var(--ink-soft)] underline"
                onClick={() => void clearSelected()}
                disabled={busyId != null}
              >
                Leeren
              </button>
            ) : null}
          </div>
          {selected.length === 0 ? (
            <p className="text-sm text-[var(--ink-soft)]">
              Noch nichts ausgewählt. Tippe unten auf Waren.
            </p>
          ) : (
            <>
              <ul className="shopping-zettel-list">
                {selected.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="shopping-zettel-chip"
                      onClick={() => void toggleSelected(item)}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="shopping-share mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="btn btn-primary px-2 text-sm"
                  onClick={() => void copyZettel()}
                >
                  {copyState === "copied"
                    ? "Kopiert!"
                    : copyState === "error"
                      ? "Fehler"
                      : "Kopieren"}
                </button>
                <button
                  type="button"
                  className="btn btn-accent px-2 text-sm"
                  onClick={() => void shareZettel()}
                >
                  Senden
                </button>
              </div>
            </>
          )}
        </div>

        <div className="shopping-tabs mb-3" role="tablist" aria-label="Warengruppen">
          {SHOPPING_CATEGORIES.map((cat) => {
            const meta = SHOPPING_CATEGORY_AT[cat];
            const active = category === cat;
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={active}
                className={`shopping-tab ${active ? "is-active" : ""}`}
                onClick={() => setCategory(cat)}
              >
                {meta.title}
              </button>
            );
          })}
        </div>

        <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
          {SHOPPING_CATEGORY_AT[category].short}
          {loading ? " · Laden…" : ""}
        </p>

        <ul className="shopping-catalog">
          {catalog.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`shopping-pick ${item.done ? "is-on" : ""}`}
                onClick={() => void toggleSelected(item)}
                disabled={busyId === item.id}
                aria-pressed={item.done}
              >
                <span className="shopping-pick-mark" aria-hidden>
                  {item.done ? "✓" : ""}
                </span>
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>

        <form
          className="shopping-composer mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void addItem();
          }}
        >
          <input
            className="field shopping-add-field"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Neu in ${SHOPPING_CATEGORY_AT[category].title}…`}
            disabled={busyId != null}
            aria-label="Neue Ware"
          />
          <button
            type="submit"
            className="btn btn-primary shopping-add-btn"
            disabled={busyId != null || !draft.trim()}
          >
            +
          </button>
        </form>
      </div>
    </div>
  );
}
