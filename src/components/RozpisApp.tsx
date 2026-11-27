"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  asDay,
  calendarCells,
  formatDaySk,
  formatShortRange,
  monthTitle,
  toISODate,
  weekdayLabels,
} from "@/lib/dates";
import type { AppState, LeaveRequest, Person, Shift } from "@/lib/types";

const WHO_KEY = "rozpis-who-am-i";
const EDIT_KEY = "rozpis-edit-code";

type Modal =
  | { type: "day"; date: string }
  | { type: "leave" }
  | { type: "people" }
  | null;

const STATUS_SK: Record<LeaveRequest["status"], string> = {
  pending: "Čaká",
  approved: "Schválené",
  cancelled: "Zrušené",
};

function parseLocalDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export default function RozpisApp() {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [whoId, setWhoId] = useState<number | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [editCode, setEditCode] = useState("");
  const [editDraft, setEditDraft] = useState("");
  const [unlocked, setUnlocked] = useState(false);

  const load = useCallback(async (y: number, m: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/state?year=${y}&month=${m}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Nepodarilo sa načítať rozpis");
      const data = (await res.json()) as AppState;
      setState(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba načítania");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(year, month);
  }, [year, month, load]);

  useEffect(() => {
    const raw = localStorage.getItem(WHO_KEY);
    if (raw) setWhoId(Number(raw));
    const saved = sessionStorage.getItem(EDIT_KEY) ?? "";
    if (saved) {
      setEditCode(saved);
      setEditDraft(saved);
      setUnlocked(true);
    }
  }, []);

  useEffect(() => {
    if (!state?.people.length) return;
    if (whoId && state.people.some((p) => p.id === whoId)) return;
    const first = state.people[0]?.id ?? null;
    setWhoId(first);
    if (first != null) localStorage.setItem(WHO_KEY, String(first));
  }, [state, whoId]);

  const who = state?.people.find((p) => p.id === whoId) ?? null;

  function mutateHeaders(): HeadersInit {
    return {
      "content-type": "application/json",
      "x-edit-code": editCode,
    };
  }

  function unlockEditing(code: string) {
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Zadajte editačný kód");
      return;
    }
    setEditCode(trimmed);
    sessionStorage.setItem(EDIT_KEY, trimmed);
    setUnlocked(true);
    setError(null);
  }

  function lockEditing() {
    setUnlocked(false);
    setEditCode("");
    setEditDraft("");
    sessionStorage.removeItem(EDIT_KEY);
  }

  async function requireUnlock(): Promise<boolean> {
    if (unlocked && editCode) return true;
    setError("Najprv odomknite úpravy tímovým kódom");
    return false;
  }

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of state?.shifts ?? []) {
      const key = asDay(s.work_date);
      const list = map.get(key) ?? [];
      list.push({ ...s, work_date: key });
      map.set(key, list);
    }
    return map;
  }, [state]);

  const leaveByDate = useMemo(() => {
    const map = new Map<string, LeaveRequest[]>();
    for (const l of state?.leave ?? []) {
      if (l.status === "cancelled") continue;
      const start = parseLocalDay(asDay(l.start_date));
      const end = parseLocalDay(asDay(l.end_date));
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = toISODate(d);
        const list = map.get(key) ?? [];
        list.push({
          ...l,
          start_date: asDay(l.start_date),
          end_date: asDay(l.end_date),
        });
        map.set(key, list);
      }
    }
    return map;
  }, [state]);

  function pickWho(id: number) {
    setWhoId(id);
    localStorage.setItem(WHO_KEY, String(id));
  }

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  async function readApiError(res: Response, fallback: string) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    return j?.error || fallback;
  }

  async function saveShift(input: {
    person_id: number;
    work_date: string;
    start_time: string;
    end_time: string;
    note: string;
  }) {
    if (!(await requireUnlock())) return;
    setBusy(true);
    try {
      const res = await fetch("/api/shifts", {
        method: "POST",
        headers: mutateHeaders(),
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Nepodarilo sa uložiť zmenu"));
      await load(year, month);
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  async function deleteShift(id: number) {
    if (!(await requireUnlock())) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/shifts?id=${id}`, {
        method: "DELETE",
        headers: { "x-edit-code": editCode },
      });
      if (!res.ok) throw new Error(await readApiError(res, "Nepodarilo sa zmazať zmenu"));
      await load(year, month);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  async function requestLeave(input: {
    person_id: number;
    start_date: string;
    end_date: string;
    note: string;
  }) {
    if (!(await requireUnlock())) return;
    setBusy(true);
    try {
      const res = await fetch("/api/leave", {
        method: "POST",
        headers: mutateHeaders(),
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Nepodarilo sa požiadať o voľno"));
      }
      await load(year, month);
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  async function setLeaveStatus(
    id: number,
    status: LeaveRequest["status"],
  ) {
    if (!(await requireUnlock())) return;
    setBusy(true);
    try {
      const res = await fetch("/api/leave", {
        method: "PATCH",
        headers: mutateHeaders(),
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Nepodarilo sa zmeniť stav"));
      await load(year, month);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  async function addPerson(name: string) {
    if (!(await requireUnlock())) return;
    setBusy(true);
    try {
      const res = await fetch("/api/people", {
        method: "POST",
        headers: mutateHeaders(),
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Nepodarilo sa pridať kolegu"));
      const person = (await res.json()) as Person;
      await load(year, month);
      pickWho(person.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  async function renamePerson(id: number, name: string) {
    if (!(await requireUnlock())) return;
    setBusy(true);
    try {
      const res = await fetch("/api/people", {
        method: "PATCH",
        headers: mutateHeaders(),
        body: JSON.stringify({ id, name }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Nepodarilo sa upraviť meno"));
      await load(year, month);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  async function removePerson(id: number) {
    if (!confirm("Naozaj zmazať tohto kolegu a všetky jeho zmeny/voľná?")) {
      return;
    }
    if (!(await requireUnlock())) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/people?id=${id}`, {
        method: "DELETE",
        headers: { "x-edit-code": editCode },
      });
      if (!res.ok) throw new Error(await readApiError(res, "Nepodarilo sa zmazať"));
      await load(year, month);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  const todayIso = toISODate(now);
  const cells = calendarCells(year, month);

  return (
    <div className="mx-auto min-h-screen w-full max-w-6xl px-3 pb-10 pt-4 sm:px-6 sm:pt-8">
      <header className="anim-rise mb-5 sm:mb-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
          Tímový kalendár
        </p>
        <h1 className="brand-title text-[clamp(2.6rem,12vw,5.2rem)] text-[var(--spruce)]">
          Rozpis
        </h1>
        <p className="mt-3 max-w-xl text-[0.98rem] leading-relaxed text-[var(--ink-soft)] sm:text-base">
          Kto má zmenu, kto má voľno — spoločný rozpis pre celý tím. Otvorte
          odkaz kedykoľvek, aj z telefónu.
        </p>

        {state?.sampleMode ? (
          <div className="mt-4 inline-flex items-center rounded-full border border-[var(--amber)]/40 bg-[color-mix(in_srgb,var(--amber)_14%,white)] px-3 py-1.5 text-sm font-semibold text-[var(--amber-deep)]">
            Ukážkové dáta (lokálny režim)
          </div>
        ) : null}
      </header>

      <section className="anim-rise mb-4 rounded-2xl border border-[var(--line)] bg-white/55 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
              Úpravy
            </p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Kalendár je na čítanie pre každého. Zmeny, voľno a kolegovia
              vyžadujú tímový editačný kód od správcu (Cursor Secrets).
            </p>
          </div>
          {unlocked ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[color-mix(in_srgb,var(--spruce-mid)_16%,white)] px-3 py-1.5 text-sm font-semibold text-[var(--spruce)]">
                Úpravy odomknuté
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={lockEditing}
              >
                Zamknúť
              </button>
            </div>
          ) : (
            <form
              className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center"
              onSubmit={(e) => {
                e.preventDefault();
                unlockEditing(editDraft);
              }}
            >
              <input
                className="field min-w-0 sm:w-44"
                type="password"
                autoComplete="off"
                placeholder="Editačný kód"
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                aria-label="Tímový editačný kód"
              />
              <button type="submit" className="btn btn-accent">
                Odomknúť
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="anim-rise mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <label className="flex w-full flex-col gap-1.5 sm:w-auto sm:min-w-[220px]">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
            Kto som
          </span>
          <select
            className="field"
            value={whoId ?? ""}
            onChange={(e) => pickWho(Number(e.target.value))}
            aria-label="Vyberte, ako ktorú osobu konáte"
            disabled={!state?.people.length}
          >
            {(state?.people ?? []).length === 0 ? (
              <option value="">Najprv pridajte kolegu</option>
            ) : (
              (state?.people ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))
            )}
          </select>
        </label>

        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <button
            type="button"
            className="btn btn-accent anim-pulse-once flex-1 sm:flex-none"
            onClick={() => setModal({ type: "leave" })}
            disabled={!who || !unlocked}
          >
            Požiadať o voľno
          </button>
          <button
            type="button"
            className="btn btn-ghost flex-1 sm:flex-none"
            onClick={() => setModal({ type: "people" })}
            disabled={!unlocked}
          >
            Kolegovia
          </button>
        </div>
      </section>

      {!loading && (state?.people.length ?? 0) === 0 ? (
        <div className="mb-4 rounded-2xl border border-dashed border-[var(--spruce-mid)]/35 bg-white/50 px-4 py-3 text-sm text-[var(--ink-soft)]">
          Zatiaľ nie sú žiadni kolegovia. Otvorte{" "}
          <button
            type="button"
            className="font-semibold text-[var(--spruce)] underline"
            onClick={() => setModal({ type: "people" })}
          >
            Kolegovia
          </button>{" "}
          a pridajte prvé meno.
        </div>
      ) : null}

      {error ? (
        <div
          className="mb-4 rounded-xl border border-[#7a4e4e]/30 bg-[#7a4e4e]/10 px-3 py-2 text-sm text-[#5c3030]"
          role="alert"
        >
          {error}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setError(null)}
          >
            zatvoriť
          </button>
        </div>
      ) : null}

      <section className="surface anim-rise p-3 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            type="button"
            className="btn btn-ghost px-3"
            onClick={() => shiftMonth(-1)}
            aria-label="Predchádzajúci mesiac"
          >
            ←
          </button>
          <h2 className="brand-title text-center text-xl capitalize text-[var(--spruce)] sm:text-2xl">
            {monthTitle(year, month)}
          </h2>
          <button
            type="button"
            className="btn btn-ghost px-3"
            onClick={() => shiftMonth(1)}
            aria-label="Nasledujúci mesiac"
          >
            →
          </button>
        </div>

        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[0.68rem] font-semibold uppercase tracking-wide text-[var(--ink-soft)] sm:gap-2 sm:text-xs">
          {weekdayLabels().map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {cells.map((cell, idx) => {
            if (!cell.date) {
              return <div key={`e-${idx}`} className="min-h-[4.2rem] sm:min-h-[6.5rem]" />;
            }
            const dayShifts = shiftsByDate.get(cell.date) ?? [];
            const dayLeave = leaveByDate.get(cell.date) ?? [];
            const isToday = cell.date === todayIso;
            return (
              <button
                key={cell.date}
                type="button"
                className={`day-cell flex min-h-[4.2rem] flex-col rounded-xl border border-[var(--line)] bg-white/55 p-1 text-left sm:min-h-[6.5rem] sm:rounded-2xl sm:p-2 ${
                  isToday ? "ring-2 ring-[var(--amber)]/70" : ""
                }`}
                onClick={() => setModal({ type: "day", date: cell.date! })}
              >
                <span
                  className={`mb-1 text-xs font-bold sm:text-sm ${
                    isToday ? "text-[var(--amber-deep)]" : "text-[var(--ink)]"
                  }`}
                >
                  {cell.day}
                </span>
                <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                  {dayShifts.slice(0, 2).map((s) => (
                    <span
                      key={s.id}
                      className="chip text-[0.62rem] text-white sm:text-[0.72rem]"
                      style={{ background: s.person_color || "#2f6f5e" }}
                      title={`${s.person_name} ${s.start_time}–${s.end_time}`}
                    >
                      <span className="hidden sm:inline">
                        {s.person_name?.split(" ")[0]} {s.start_time}
                      </span>
                      <span className="sm:hidden">
                        {(s.person_name ?? "?").slice(0, 2)}
                      </span>
                    </span>
                  ))}
                  {dayLeave.slice(0, 1).map((l) => (
                    <span
                      key={`l-${l.id}`}
                      className="chip text-[0.62rem] text-[var(--leave)] sm:text-[0.7rem]"
                      style={{
                        background: "color-mix(in srgb, var(--leave) 16%, white)",
                      }}
                      title={`${l.person_name}: voľno (${STATUS_SK[l.status]})`}
                    >
                      <span className="hidden sm:inline">
                        {l.person_name?.split(" ")[0]} voľno
                      </span>
                      <span className="sm:hidden">
                        {(l.person_name ?? "?").slice(0, 1)}+V
                      </span>
                    </span>
                  ))}
                  {dayShifts.length + dayLeave.length > 3 ? (
                    <span className="text-[0.65rem] font-semibold text-[var(--ink-soft)]">
                      +{dayShifts.length + dayLeave.length - 3}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
        {loading ? (
          <p className="mt-3 text-sm text-[var(--ink-soft)]">Načítavam…</p>
        ) : null}
      </section>

      <section className="anim-rise mt-5 surface p-4 sm:mt-6 sm:p-5">
        <h3 className="brand-title mb-1 text-xl text-[var(--spruce)]">
          Žiadosti o voľno
        </h3>
        <p className="mb-4 text-sm text-[var(--ink-soft)]">
          Prehľad žiadostí v tomto mesiaci. Schválenie alebo zrušenie môže
          urobiť ktokoľvek s odkazom.
        </p>
        <ul className="flex flex-col gap-3">
          {(state?.leave ?? []).length === 0 ? (
            <li className="text-sm text-[var(--ink-soft)]">
              Zatiaľ žiadne žiadosti.
            </li>
          ) : (
            (state?.leave ?? []).map((l) => (
              <li
                key={l.id}
                className="flex flex-col gap-2 rounded-2xl border border-[var(--line)] bg-white/60 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: l.person_color || "#7a4e4e" }}
                    />
                    <strong>{l.person_name}</strong>
                    <span className="rounded-full bg-[var(--mist)] px-2 py-0.5 text-xs font-semibold text-[var(--ink-soft)]">
                      {STATUS_SK[l.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">
                    {formatShortRange(asDay(l.start_date), asDay(l.end_date))}
                    {l.note ? ` · ${l.note}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {l.status === "pending" ? (
                    <button
                      type="button"
                      className="btn btn-primary px-3 py-2 text-sm"
                      disabled={busy}
                      onClick={() => void setLeaveStatus(l.id, "approved")}
                    >
                      Schváliť
                    </button>
                  ) : null}
                  {l.status !== "cancelled" ? (
                    <button
                      type="button"
                      className="btn btn-ghost px-3 py-2 text-sm"
                      disabled={busy}
                      onClick={() => void setLeaveStatus(l.id, "cancelled")}
                    >
                      Zrušiť
                    </button>
                  ) : null}
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      {modal?.type === "day" ? (
        <DayModal
          date={modal.date}
          people={state?.people ?? []}
          shifts={(shiftsByDate.get(modal.date) ?? []).slice()}
          leave={leaveByDate.get(modal.date) ?? []}
          who={who}
          busy={busy}
          onClose={() => setModal(null)}
          onSave={saveShift}
          onDeleteShift={(id) => void deleteShift(id)}
        />
      ) : null}

      {modal?.type === "leave" && who ? (
        <LeaveModal
          who={who}
          people={state?.people ?? []}
          busy={busy}
          onClose={() => setModal(null)}
          onSubmit={requestLeave}
        />
      ) : null}

      {modal?.type === "people" ? (
        <PeopleModal
          people={state?.people ?? []}
          busy={busy}
          onClose={() => setModal(null)}
          onAdd={addPerson}
          onRename={renamePerson}
          onRemove={removePerson}
        />
      ) : null}
    </div>
  );
}

function DayModal({
  date,
  people,
  shifts,
  leave,
  who,
  busy,
  onClose,
  onSave,
  onDeleteShift,
}: {
  date: string;
  people: Person[];
  shifts: Shift[];
  leave: LeaveRequest[];
  who: Person | null;
  busy: boolean;
  onClose: () => void;
  onSave: (input: {
    person_id: number;
    work_date: string;
    start_time: string;
    end_time: string;
    note: string;
  }) => Promise<void>;
  onDeleteShift: (id: number) => void;
}) {
  const mine = shifts.find((s) => s.person_id === who?.id);
  const [personId, setPersonId] = useState(who?.id ?? people[0]?.id ?? 0);
  const [start, setStart] = useState(mine?.start_time ?? "08:00");
  const [end, setEnd] = useState(mine?.end_time ?? "16:00");
  const [note, setNote] = useState(mine?.note ?? "");

  useEffect(() => {
    const current = shifts.find((s) => s.person_id === personId);
    setStart(current?.start_time ?? "08:00");
    setEnd(current?.end_time ?? "16:00");
    setNote(current?.note ?? "");
  }, [personId, shifts]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 id="day-title" className="brand-title text-2xl text-[var(--spruce)]">
              Deň {formatDaySk(date)}
            </h3>
            <p className="text-sm text-[var(--ink-soft)]">
              Nastavte alebo upravte pracovnú zmenu.
            </p>
          </div>
          <button type="button" className="btn btn-ghost px-3" onClick={onClose}>
            ✕
          </button>
        </div>

        {shifts.length || leave.length ? (
          <div className="mb-4 space-y-2">
            {shifts.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 text-sm"
              >
                <span>
                  <strong style={{ color: s.person_color }}>{s.person_name}</strong>{" "}
                  {s.start_time}–{s.end_time}
                  {s.note ? ` · ${s.note}` : ""}
                </span>
                <button
                  type="button"
                  className="text-xs font-semibold text-[var(--leave)] underline"
                  onClick={() => onDeleteShift(s.id)}
                  disabled={busy}
                >
                  Zmazať
                </button>
              </div>
            ))}
            {leave.map((l) => (
              <div
                key={l.id}
                className="rounded-xl border border-[var(--leave)]/20 bg-[color-mix(in_srgb,var(--leave)_8%,white)] px-3 py-2 text-sm"
              >
                <strong>{l.person_name}</strong> — voľno ({STATUS_SK[l.status]})
                {l.note ? ` · ${l.note}` : ""}
              </div>
            ))}
          </div>
        ) : (
          <p className="mb-4 text-sm text-[var(--ink-soft)]">
            Zatiaľ žiadne zmeny ani voľno.
          </p>
        )}

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void onSave({
              person_id: personId,
              work_date: date,
              start_time: start,
              end_time: end,
              note,
            });
          }}
        >
          <label className="block text-sm font-semibold">
            Osoba
            <select
              className="field mt-1"
              value={personId}
              onChange={(e) => setPersonId(Number(e.target.value))}
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold">
              Od
              <input
                className="field mt-1"
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm font-semibold">
              Do
              <input
                className="field mt-1"
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </label>
          </div>
          <label className="block text-sm font-semibold">
            Poznámka
            <input
              className="field mt-1"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="voliteľné"
            />
          </label>
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="submit" className="btn btn-primary" disabled={busy || !personId}>
              Uložiť zmenu
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Zavrieť
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LeaveModal({
  who,
  people,
  busy,
  onClose,
  onSubmit,
}: {
  who: Person;
  people: Person[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: {
    person_id: number;
    start_date: string;
    end_date: string;
    note: string;
  }) => Promise<void>;
}) {
  const today = toISODate(new Date());
  const [personId, setPersonId] = useState(who.id);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [note, setNote] = useState("");

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 id="leave-title" className="brand-title text-2xl text-[var(--spruce)]">
              Požiadať o voľno
            </h3>
            <p className="text-sm text-[var(--ink-soft)]">
              Vyberte obdobie. Stav bude „Čaká“ kým niekto neschváli.
            </p>
          </div>
          <button type="button" className="btn btn-ghost px-3" onClick={onClose}>
            ✕
          </button>
        </div>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit({
              person_id: personId,
              start_date: start,
              end_date: end,
              note,
            });
          }}
        >
          <label className="block text-sm font-semibold">
            Za koho
            <select
              className="field mt-1"
              value={personId}
              onChange={(e) => setPersonId(Number(e.target.value))}
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              Od
              <input
                className="field mt-1"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm font-semibold">
              Do
              <input
                className="field mt-1"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </label>
          </div>
          <label className="block text-sm font-semibold">
            Poznámka
            <textarea
              className="field mt-1 min-h-[88px] resize-y"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="voliteľné"
            />
          </label>
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="submit" className="btn btn-accent" disabled={busy}>
              Odoslať žiadosť
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Zavrieť
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PeopleModal({
  people,
  busy,
  onClose,
  onAdd,
  onRename,
  onRemove,
}: {
  people: Person[];
  busy: boolean;
  onClose: () => void;
  onAdd: (name: string) => Promise<void>;
  onRename: (id: number, name: string) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="people-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 id="people-title" className="brand-title text-2xl text-[var(--spruce)]">
              Kolegovia
            </h3>
            <p className="text-sm text-[var(--ink-soft)]">
              Pridajte alebo upravte mená v rozpise.
            </p>
          </div>
          <button type="button" className="btn btn-ghost px-3" onClick={onClose}>
            ✕
          </button>
        </div>

        <ul className="mb-4 space-y-2">
          {people.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-2 rounded-xl border border-[var(--line)] bg-white/70 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              {editing === p.id ? (
                <form
                  className="flex w-full flex-col gap-2 sm:flex-row sm:items-center"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void onRename(p.id, editName).then(() => setEditing(null));
                  }}
                >
                  <input
                    className="field"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button type="submit" className="btn btn-primary px-3 py-2 text-sm" disabled={busy}>
                      Uložiť
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost px-3 py-2 text-sm"
                      onClick={() => setEditing(null)}
                    >
                      Späť
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ background: p.color }}
                    />
                    <strong>{p.name}</strong>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost px-3 py-2 text-sm"
                      onClick={() => {
                        setEditing(p.id);
                        setEditName(p.name);
                      }}
                    >
                      Upraviť
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost px-3 py-2 text-sm text-[var(--leave)]"
                      disabled={busy}
                      onClick={() => void onRemove(p.id)}
                    >
                      Zmazať
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>

        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim();
            if (!n) return;
            void onAdd(n).then(() => setName(""));
          }}
        >
          <input
            className="field"
            placeholder="Nové meno"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            Pridať
          </button>
        </form>
      </div>
    </div>
  );
}
