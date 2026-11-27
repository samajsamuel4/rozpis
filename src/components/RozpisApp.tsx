"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  asDay,
  calendarCells,
  formatDayAt,
  formatShortRange,
  monthTitle,
  toISODate,
  weekdayLabels,
} from "@/lib/dates";
import type {
  AppState,
  LeaveRequest,
  LeaveType,
  Person,
  Reservation,
  Shift,
} from "@/lib/types";
import {
  LEAVE_TYPE_AT,
  LEAVE_TYPE_COLORS,
  LEAVE_TYPE_SHORT_AT,
  WORK_CHIP_BG,
} from "@/lib/types";

const WHO_KEY = "rozpis-who-am-i";
const EDIT_KEY = "rozpis-edit-code";

type Modal =
  | { type: "day"; date: string }
  | { type: "leave" }
  | { type: "people" }
  | { type: "reservation"; date?: string }
  | null;

const STATUS_AT: Record<LeaveRequest["status"], string> = {
  pending: "Offen",
  approved: "Genehmigt",
  cancelled: "Storniert",
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
  const [booting, setBooting] = useState(true);
  const [gateBusy, setGateBusy] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);

  const load = useCallback(async (y: number, m: number, code?: string) => {
    setLoading(true);
    setError(null);
    try {
      const headers: HeadersInit = {};
      const token = (code ?? editCode).trim();
      if (token) headers["x-edit-code"] = token;
      const res = await fetch(`/api/state?year=${y}&month=${m}`, {
        cache: "no-store",
        headers,
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          j?.error ||
            (res.status === 429
              ? "Zu viele falsche Codes. Bitte später erneut versuchen."
              : "Dienstplan konnte nicht geladen werden"),
        );
      }
      const data = (await res.json()) as AppState;
      setState(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ladefehler");
    } finally {
      setLoading(false);
    }
  }, [editCode]);

  useEffect(() => {
    if (!unlocked) return;
    void load(year, month);
  }, [year, month, load, unlocked]);

  const enterWithCode = useCallback(
    async (code: string, fromSession = false) => {
      const trimmed = code.trim();
      if (!trimmed) {
        setGateError("Bitte Code eingeben");
        setBooting(false);
        return false;
      }
      if (trimmed.length < 4) {
        setGateError("Code muss mindestens 4 Zeichen haben");
        setBooting(false);
        return false;
      }
      setGateBusy(true);
      setGateError(null);
      try {
        const res = await fetch("/api/unlock", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-edit-code": trimmed,
          },
          body: "{}",
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          if (res.status === 429) {
            throw new Error(
              j?.error ||
                "Zu viele falsche Codes. Bitte später erneut versuchen.",
            );
          }
          throw new Error(
            fromSession ? "Sitzung abgelaufen — erneut anmelden." : "Code ungültig",
          );
        }
        setEditCode(trimmed);
        setEditDraft(trimmed);
        sessionStorage.setItem(EDIT_KEY, trimmed);
        setUnlocked(true);
        setGateError(null);
        return true;
      } catch (e) {
        if (fromSession) sessionStorage.removeItem(EDIT_KEY);
        setUnlocked(false);
        setEditCode("");
        setGateError(e instanceof Error ? e.message : "Code ungültig");
        return false;
      } finally {
        setGateBusy(false);
        setBooting(false);
      }
    },
    [],
  );

  useEffect(() => {
    const raw = localStorage.getItem(WHO_KEY);
    if (raw) setWhoId(Number(raw));
    const saved = sessionStorage.getItem(EDIT_KEY) ?? "";
    if (saved) {
      void enterWithCode(saved, true);
    } else {
      setBooting(false);
    }
  }, [enterWithCode]);

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

  function lockEditing() {
    setUnlocked(false);
    setEditCode("");
    setEditDraft("");
    setState(null);
    sessionStorage.removeItem(EDIT_KEY);
    setGateError(null);
  }

  async function requireUnlock(): Promise<boolean> {
    if (unlocked && editCode) return true;
    setError("Bitte erneut anmelden");
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
          note: l.note ?? "",
          start_date: asDay(l.start_date),
          end_date: asDay(l.end_date),
        });
        map.set(key, list);
      }
    }
    return map;
  }, [state]);

  const reservationsByDate = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const r of state?.reservations ?? []) {
      const key = asDay(r.reservation_date);
      const list = map.get(key) ?? [];
      list.push({ ...r, reservation_date: key });
      map.set(key, list);
    }
    return map;
  }, [state]);

  const reservationTotalsByDate = useMemo(() => {
    const map = new Map<string, { count: number; guests: number }>();
    for (const t of state?.reservationTotals ?? []) {
      map.set(asDay(t.date), {
        count: Number(t.count || 0),
        guests: Number(t.guests || 0),
      });
    }
    // Fallback if older payload only had reservation rows
    if (map.size === 0) {
      for (const [key, list] of reservationsByDate) {
        map.set(key, {
          count: list.length,
          guests: list.reduce((sum, r) => sum + Number(r.guest_count || 0), 0),
        });
      }
    }
    return map;
  }, [state, reservationsByDate]);

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
      if (!res.ok)
        throw new Error(await readApiError(res, "Schicht konnte nicht gespeichert werden"));
      await load(year, month);
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
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
      if (!res.ok)
        throw new Error(await readApiError(res, "Schicht konnte nicht gelöscht werden"));
      await load(year, month);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function requestLeave(input: {
    person_id: number;
    start_date: string;
    end_date: string;
    note: string;
    leave_type: LeaveType;
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
        throw new Error(
          await readApiError(res, "Antrag konnte nicht gesendet werden"),
        );
      }
      await load(year, month);
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function setLeaveStatus(id: number, status: LeaveRequest["status"]) {
    if (!(await requireUnlock())) return;
    setBusy(true);
    try {
      const res = await fetch("/api/leave", {
        method: "PATCH",
        headers: mutateHeaders(),
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok)
        throw new Error(await readApiError(res, "Status konnte nicht geändert werden"));
      await load(year, month);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function addPerson(name: string, workStart: string, workEnd: string) {
    if (!(await requireUnlock())) return;
    setBusy(true);
    try {
      const res = await fetch("/api/people", {
        method: "POST",
        headers: mutateHeaders(),
        body: JSON.stringify({
          name,
          work_start: workStart,
          work_end: workEnd,
        }),
      });
      if (!res.ok)
        throw new Error(await readApiError(res, "Kollege konnte nicht hinzugefügt werden"));
      const person = (await res.json()) as Person;
      await load(year, month);
      pickWho(person.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function renamePerson(
    id: number,
    name: string,
    workStart: string,
    workEnd: string,
  ) {
    if (!(await requireUnlock())) return;
    setBusy(true);
    try {
      const res = await fetch("/api/people", {
        method: "PATCH",
        headers: mutateHeaders(),
        body: JSON.stringify({
          id,
          name,
          work_start: workStart,
          work_end: workEnd,
        }),
      });
      if (!res.ok)
        throw new Error(await readApiError(res, "Konnte nicht geändert werden"));
      await load(year, month);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function saveReservation(input: {
    reservation_date: string;
    reservation_time: string;
    guest_count: number;
    guest_name: string;
    note: string;
  }) {
    if (!(await requireUnlock())) return;
    setBusy(true);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: mutateHeaders(),
        body: JSON.stringify(input),
      });
      if (!res.ok)
        throw new Error(
          await readApiError(res, "Reservierung konnte nicht gespeichert werden"),
        );
      await load(year, month);
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function deleteReservation(id: number) {
    if (!confirm("Diese Reservierung wirklich löschen?")) return;
    if (!(await requireUnlock())) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/reservations?id=${id}`, {
        method: "DELETE",
        headers: { "x-edit-code": editCode },
      });
      if (!res.ok)
        throw new Error(
          await readApiError(res, "Reservierung konnte nicht gelöscht werden"),
        );
      await load(year, month);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function removePerson(id: number) {
    if (
      !confirm(
        "Diesen Kollegen wirklich löschen – inklusive aller Schichten und Abwesenheiten?",
      )
    ) {
      return;
    }
    if (!(await requireUnlock())) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/people?id=${id}`, {
        method: "DELETE",
        headers: { "x-edit-code": editCode },
      });
      if (!res.ok)
        throw new Error(await readApiError(res, "Löschen fehlgeschlagen"));
      await load(year, month);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  const todayIso = toISODate(now);
  const cells = calendarCells(year, month);

  if (booting) {
    return (
      <div className="gate-shell">
        <div className="gate-panel">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--ink-soft)]">
            Restaurant Fitz
          </p>
          <h1 className="brand-title mt-3 text-[clamp(3.4rem,16vw,6rem)]">
            Dienstplan
          </h1>
          <p className="mt-4 text-[var(--ink-soft)]">Laden…</p>
        </div>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="gate-shell">
        <div className="gate-panel">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--ink-soft)]">
            Restaurant Fitz
          </p>
          <h1 className="brand-title mt-3 text-[clamp(3.4rem,16vw,6rem)]">
            Dienstplan
          </h1>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-[var(--ink-soft)]">
            Team-Zugang. Code eingeben, um den Plan zu öffnen.
          </p>
          <form
            className="mt-8 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void enterWithCode(editDraft);
            }}
          >
            <label className="sr-only" htmlFor="team-code">
              Team-Code
            </label>
            <input
              id="team-code"
              className="field min-h-[56px] px-4 text-center text-2xl tracking-[0.35em]"
              type="password"
              inputMode="text"
              autoComplete="current-password"
              autoFocus
              maxLength={32}
              placeholder="····"
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              disabled={gateBusy}
            />
            {gateError ? (
              <p className="text-sm text-[#ffc9c9]" role="alert">
                {gateError}
              </p>
            ) : null}
            <button
              type="submit"
              className="btn btn-primary min-h-[52px] text-base"
              disabled={gateBusy}
            >
              {gateBusy ? "Prüfen…" : "Eintreten"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-5xl px-3 pb-10 pt-5 sm:px-6 sm:pt-8">
      <header className="anim-rise mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--ink-soft)]">
            Restaurant Fitz
          </p>
          <h1 className="brand-title text-[clamp(2.4rem,10vw,4.2rem)]">
            Dienstplan
          </h1>
          {state?.sampleMode ? (
            <p className="mt-2 text-sm text-[var(--gold)]">Beispieldaten (lokal)</p>
          ) : null}
        </div>
        <button
          type="button"
          className="btn btn-ghost px-4 text-sm"
          onClick={lockEditing}
        >
          Abmelden
        </button>
      </header>

      <section className="anim-rise mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <label className="flex w-full flex-col gap-1.5 sm:w-auto sm:min-w-[200px]">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
            Wer bin ich
          </span>
          <select
            className="field"
            value={whoId ?? ""}
            onChange={(e) => pickWho(Number(e.target.value))}
            aria-label="Person auswählen"
            disabled={!state?.people.length}
          >
            {(state?.people ?? []).length === 0 ? (
              <option value="">Zuerst Kollegen anlegen</option>
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
            className="btn btn-primary flex-1 sm:flex-none"
            onClick={() => setModal({ type: "reservation" })}
          >
            Reservierung
          </button>
          <button
            type="button"
            className="btn btn-accent flex-1 sm:flex-none"
            onClick={() => setModal({ type: "leave" })}
            disabled={!who}
          >
            Abwesenheit
          </button>
          <button
            type="button"
            className="btn btn-ghost flex-1 sm:flex-none"
            onClick={() => setModal({ type: "people" })}
          >
            Kollegen
          </button>
        </div>
      </section>

      {!loading && (state?.people.length ?? 0) === 0 ? (
        <div className="mb-4 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink-soft)]">
          Noch keine Kollegen. Öffne{" "}
          <button
            type="button"
            className="font-semibold text-[var(--gold)] underline"
            onClick={() => setModal({ type: "people" })}
          >
            Kollegen
          </button>{" "}
          und lege den ersten Namen an.
        </div>
      ) : null}

      {error ? (
        <div
          className="mb-4 rounded-xl border border-[var(--danger)]/35 bg-[color-mix(in_srgb,var(--danger)_18%,transparent)] px-3 py-2 text-sm text-[#ffd4d4]"
          role="alert"
        >
          {error}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setError(null)}
          >
            schließen
          </button>
        </div>
      ) : null}

      <section className="surface anim-rise p-3 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            type="button"
            className="btn btn-ghost px-3"
            onClick={() => shiftMonth(-1)}
            aria-label="Voriger Monat"
          >
            ←
          </button>
          <h2 className="brand-title text-center text-xl sm:text-2xl">
            {monthTitle(year, month)}
          </h2>
          <button
            type="button"
            className="btn btn-ghost px-3"
            onClick={() => shiftMonth(1)}
            aria-label="Nächster Monat"
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
              return (
                <div key={`e-${idx}`} className="min-h-[4.2rem] sm:min-h-[6.5rem]" />
              );
            }
            const dayShifts = shiftsByDate.get(cell.date) ?? [];
            const dayLeave = leaveByDate.get(cell.date) ?? [];
            const dayRes = reservationTotalsByDate.get(cell.date);
            const isToday = cell.date === todayIso;
            return (
              <button
                key={cell.date}
                type="button"
                className={`day-cell flex min-h-[4.2rem] flex-col rounded-xl border border-[var(--line)] bg-white/[0.06] p-1 text-left sm:min-h-[6.5rem] sm:rounded-2xl sm:p-2 ${
                  isToday ? "ring-2 ring-[var(--teal)]/75" : ""
                }`}
                onClick={() => setModal({ type: "day", date: cell.date! })}
              >
                <span
                  className={`mb-1 text-xs font-bold sm:text-sm ${
                    isToday ? "text-[var(--teal)]" : "text-[var(--ink)]"
                  }`}
                >
                  {cell.day}
                </span>
                <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                  {dayRes && dayRes.guests > 0 ? (
                    <span
                      className="chip text-[0.62rem] font-bold sm:text-[0.7rem]"
                      style={{
                        background: "var(--reserve-soft)",
                        color: "var(--reserve)",
                        border:
                          "1px solid color-mix(in srgb, var(--reserve) 50%, transparent)",
                      }}
                      title={`${dayRes.count} Reservierung(en), ${dayRes.guests} Gäste`}
                    >
                      <span className="hidden sm:inline">
                        {dayRes.guests} Gäste · {dayRes.count} Res.
                      </span>
                      <span className="sm:hidden">{dayRes.guests}G</span>
                    </span>
                  ) : null}
                  {dayShifts.slice(0, 1).map((s) => (
                    <span
                      key={s.id}
                      className="chip text-[0.62rem] text-white sm:text-[0.72rem]"
                      style={{
                        background: WORK_CHIP_BG,
                        border:
                          "1px solid color-mix(in srgb, var(--work-deep) 40%, transparent)",
                      }}
                      title={`${s.person_name} ${s.start_time}–${s.end_time} (Arbeit)`}
                    >
                      <span className="hidden sm:inline">
                        {s.person_name?.split(" ")[0]} {s.start_time}
                      </span>
                      <span className="sm:hidden">
                        {(s.person_name ?? "?").slice(0, 2)}
                      </span>
                    </span>
                  ))}
                  {dayLeave.slice(0, 1).map((l) => {
                    const kind = l.leave_type ?? "free_day";
                    const colors = LEAVE_TYPE_COLORS[kind];
                    return (
                      <span
                        key={`l-${l.id}`}
                        className="chip text-[0.62rem] sm:text-[0.7rem]"
                        style={{
                          background: colors.bg,
                          color: colors.fg,
                          border: `1px solid ${colors.border}`,
                        }}
                        title={`${l.person_name}: ${LEAVE_TYPE_AT[kind]} (${STATUS_AT[l.status]})`}
                      >
                        <span className="hidden sm:inline">
                          {l.person_name?.split(" ")[0]}{" "}
                          {LEAVE_TYPE_SHORT_AT[kind]}
                        </span>
                        <span className="sm:hidden">
                          {(l.person_name ?? "?").slice(0, 1)}+
                          {kind === "vacation" ? "U" : "F"}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
        {loading ? (
          <p className="mt-3 text-sm text-[var(--ink-soft)]">Lade…</p>
        ) : null}
      </section>

      <section className="anim-rise mt-5 surface p-4 sm:mt-6 sm:p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h3 className="brand-title text-xl">Reservierungen</h3>
          <button
            type="button"
            className="btn btn-primary px-3 py-2 text-sm"
            disabled={!unlocked}
            onClick={() => setModal({ type: "reservation" })}
          >
            + Reservierung
          </button>
        </div>
        <ul className="flex flex-col gap-3">
          {(state?.reservations?.length ?? 0) > 0 ? (
            (state?.reservations ?? []).map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-2 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between"
                style={{
                  background: "var(--reserve-soft)",
                  borderColor:
                    "color-mix(in srgb, var(--reserve) 45%, transparent)",
                }}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{r.guest_name.trim() || "Reservierung"}</strong>
                    <span
                      className="rounded-lg px-2 py-0.5 text-xs font-semibold text-[#1a1410]"
                      style={{ background: "var(--reserve)" }}
                    >
                      {r.guest_count} Gäste
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">
                    {formatDayAt(asDay(r.reservation_date))} ·{" "}
                    {r.reservation_time}
                    {r.note ? ` · ${r.note}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost px-3 py-2 text-sm text-[var(--leave)]"
                  disabled={busy || !unlocked}
                  onClick={() => void deleteReservation(r.id)}
                >
                  Löschen
                </button>
              </li>
            ))
          ) : (state?.reservationTotals ?? []).length > 0 ? (
            (state?.reservationTotals ?? []).map((t) => (
              <li
                key={t.date}
                className="rounded-2xl border px-3 py-2 text-sm"
                style={{
                  background: "var(--reserve-soft)",
                  borderColor:
                    "color-mix(in srgb, var(--reserve) 45%, transparent)",
                }}
              >
                <strong>{formatDayAt(asDay(t.date))}</strong>
                <span className="text-[var(--ink-soft)]">
                  {" "}
                  · {t.count} Res. · {t.guests} Gäste
                </span>
              </li>
            ))
          ) : (
            <li className="text-sm text-[var(--ink-soft)]">
              Noch keine Reservierungen in diesem Monat.
            </li>
          )}
        </ul>
      </section>

      <section className="anim-rise mt-5 surface p-4 sm:mt-6 sm:p-5">
        <h3 className="brand-title mb-3 text-xl">Abwesenheiten</h3>
        <ul className="flex flex-col gap-3">
          {(state?.leave ?? []).length === 0 ? (
            <li className="text-sm text-[var(--ink-soft)]">
              Noch keine Anträge in diesem Monat.
            </li>
          ) : (
            (state?.leave ?? []).map((l) => {
              const kind = l.leave_type ?? "free_day";
              const colors = LEAVE_TYPE_COLORS[kind];
              return (
              <li
                key={l.id}
                className="flex flex-col gap-2 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between"
                style={{
                  background: colors.bg,
                  borderColor: colors.border,
                }}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: colors.fg }}
                    />
                    <strong>{l.person_name}</strong>
                    <span
                      className="rounded-lg px-2 py-0.5 text-xs font-semibold"
                      style={{
                        background:
                          kind === "vacation"
                            ? "var(--vacation)"
                            : "var(--free-day)",
                        color: "#fff",
                      }}
                    >
                      {LEAVE_TYPE_AT[kind]}
                    </span>
                    <span className="rounded-lg bg-black/20 px-2 py-0.5 text-xs font-semibold text-[var(--ink-soft)]">
                      {STATUS_AT[l.status]}
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
                      disabled={busy || !unlocked}
                      onClick={() => void setLeaveStatus(l.id, "approved")}
                    >
                      Genehmigen
                    </button>
                  ) : null}
                  {l.status !== "cancelled" ? (
                    <button
                      type="button"
                      className="btn btn-ghost px-3 py-2 text-sm"
                      disabled={busy || !unlocked}
                      onClick={() => void setLeaveStatus(l.id, "cancelled")}
                    >
                      Stornieren
                    </button>
                  ) : null}
                </div>
              </li>
              );
            })
          )}
        </ul>
      </section>

      {modal?.type === "day" ? (
        <DayModal
          date={modal.date}
          people={state?.people ?? []}
          shifts={(shiftsByDate.get(modal.date) ?? []).slice()}
          leave={leaveByDate.get(modal.date) ?? []}
          reservations={(reservationsByDate.get(modal.date) ?? []).slice()}
          who={who}
          busy={busy}
          unlocked={unlocked}
          onClose={() => setModal(null)}
          onSave={saveShift}
          onDeleteShift={(id) => void deleteShift(id)}
          onAddReservation={() =>
            setModal({ type: "reservation", date: modal.date })
          }
          onDeleteReservation={(id) => void deleteReservation(id)}
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

      {modal?.type === "reservation" ? (
        <ReservationModal
          initialDate={modal.date ?? todayIso}
          busy={busy}
          onClose={() => setModal(null)}
          onSubmit={saveReservation}
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
  reservations,
  who,
  busy,
  unlocked,
  onClose,
  onSave,
  onDeleteShift,
  onAddReservation,
  onDeleteReservation,
}: {
  date: string;
  people: Person[];
  shifts: Shift[];
  leave: LeaveRequest[];
  reservations: Reservation[];
  who: Person | null;
  busy: boolean;
  unlocked: boolean;
  onClose: () => void;
  onSave: (input: {
    person_id: number;
    work_date: string;
    start_time: string;
    end_time: string;
    note: string;
  }) => Promise<void>;
  onDeleteShift: (id: number) => void;
  onAddReservation: () => void;
  onDeleteReservation: (id: number) => void;
}) {
  const mine = shifts.find((s) => s.person_id === who?.id);
  const initialPerson = who ?? people[0] ?? null;
  const [personId, setPersonId] = useState(initialPerson?.id ?? 0);
  const [start, setStart] = useState(
    mine?.start_time ?? initialPerson?.work_start ?? "08:00",
  );
  const [end, setEnd] = useState(
    mine?.end_time ?? initialPerson?.work_end ?? "16:00",
  );
  const [note, setNote] = useState(mine?.note ?? "");

  useEffect(() => {
    const current = shifts.find((s) => s.person_id === personId);
    const person = people.find((p) => p.id === personId);
    setStart(current?.start_time ?? person?.work_start ?? "08:00");
    setEnd(current?.end_time ?? person?.work_end ?? "16:00");
    setNote(current?.note ?? "");
  }, [personId, shifts, people]);

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
            <h3 id="day-title" className="brand-title text-2xl">
              Tag {formatDayAt(date)}
            </h3>
            <p className="text-sm text-[var(--ink-soft)]">
              Schicht / Arbeitszeit setzen oder ändern.
            </p>
          </div>
          <button type="button" className="btn btn-ghost px-3" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="mb-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
              Reservierungen (
              {reservations.reduce((s, r) => s + Number(r.guest_count || 0), 0)}{" "}
              Gäste)
            </p>
            <button
              type="button"
              className="btn btn-primary px-3 py-1.5 text-xs"
              disabled={!unlocked || busy}
              onClick={onAddReservation}
            >
              + Res.
            </button>
          </div>
          {reservations.length === 0 ? (
            <p className="text-sm text-[var(--ink-soft)]">Keine Reservierungen.</p>
          ) : (
            reservations.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"
                style={{
                  background: "var(--reserve-soft)",
                  borderColor:
                    "color-mix(in srgb, var(--reserve) 45%, transparent)",
                }}
              >
                <span>
                  <strong>{r.guest_name.trim() || "Reservierung"}</strong> ·{" "}
                  {r.reservation_time} · {r.guest_count} Gäste
                  {r.note ? ` · ${r.note}` : ""}
                </span>
                <button
                  type="button"
                  className="text-xs font-semibold text-[var(--leave)] underline"
                  onClick={() => onDeleteReservation(r.id)}
                  disabled={busy || !unlocked}
                >
                  Löschen
                </button>
              </div>
            ))
          )}
        </div>

        {shifts.length || leave.length ? (
          <div className="mb-4 space-y-2">
            {shifts.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-white/[0.05] px-3 py-2 text-sm"
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
                  Löschen
                </button>
              </div>
            ))}
            {leave.map((l) => {
              const kind = l.leave_type ?? "free_day";
              const colors = LEAVE_TYPE_COLORS[kind];
              return (
                <div
                  key={l.id}
                  className="rounded-xl border px-3 py-2 text-sm"
                  style={{
                    background: colors.bg,
                    borderColor: colors.border,
                    color: colors.fg,
                  }}
                >
                  <strong>{l.person_name}</strong> — {LEAVE_TYPE_AT[kind]} (
                  {STATUS_AT[l.status]})
                  {l.note ? ` · ${l.note}` : ""}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mb-4 text-sm text-[var(--ink-soft)]">
            Noch keine Schichten oder Abwesenheiten.
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
            Person
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
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Arbeitszeit</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-semibold text-[var(--ink-soft)]">
                Von
                <input
                  className="field mt-1"
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm font-semibold text-[var(--ink-soft)]">
                Bis
                <input
                  className="field mt-1"
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  required
                />
              </label>
            </div>
          </fieldset>
          <label className="block text-sm font-semibold">
            Notiz
            <input
              className="field mt-1"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="optional"
            />
          </label>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || !personId}
            >
              Arbeitszeit speichern
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Schließen
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
    leave_type: LeaveType;
  }) => Promise<void>;
}) {
  const today = toISODate(new Date());
  const [personId, setPersonId] = useState(who.id);
  const [leaveType, setLeaveType] = useState<LeaveType>("free_day");
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
            <h3 id="leave-title" className="brand-title text-2xl">
              Abwesenheit
            </h3>
            <p className="text-sm text-[var(--ink-soft)]">
              Freier Tag oder Urlaub wählen. Status bleibt „Offen“, bis jemand
              genehmigt.
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
              leave_type: leaveType,
            });
          }}
        >
          <label className="block text-sm font-semibold">
            Art
            <select
              className="field mt-1"
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value as LeaveType)}
            >
              <option value="free_day">Freier Tag</option>
              <option value="vacation">Urlaub</option>
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Für wen
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
              Von
              <input
                className="field mt-1"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm font-semibold">
              Bis
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
            Notiz
            <textarea
              className="field mt-1 min-h-[88px] resize-y"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="optional"
            />
          </label>
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="submit" className="btn btn-accent" disabled={busy}>
              Antrag senden
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Schließen
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
  onAdd: (
    name: string,
    workStart: string,
    workEnd: string,
  ) => Promise<void>;
  onRename: (
    id: number,
    name: string,
    workStart: string,
    workEnd: string,
  ) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [workStart, setWorkStart] = useState("08:00");
  const [workEnd, setWorkEnd] = useState("16:00");
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editStart, setEditStart] = useState("08:00");
  const [editEnd, setEditEnd] = useState("16:00");

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
            <h3 id="people-title" className="brand-title text-2xl">
              Kollegen
            </h3>
            <p className="text-sm text-[var(--ink-soft)]">
              Namen und Standard-Arbeitszeit im Dienstplan.
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
              className="flex flex-col gap-2 rounded-xl border border-[var(--line)] bg-white/[0.05] p-3"
            >
              {editing === p.id ? (
                <form
                  className="flex w-full flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void onRename(p.id, editName, editStart, editEnd).then(
                      () => setEditing(null),
                    );
                  }}
                >
                  <input
                    className="field"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoFocus
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs font-semibold text-[var(--ink-soft)]">
                      Arbeitszeit von
                      <input
                        className="field mt-1"
                        type="time"
                        value={editStart}
                        onChange={(e) => setEditStart(e.target.value)}
                      />
                    </label>
                    <label className="text-xs font-semibold text-[var(--ink-soft)]">
                      bis
                      <input
                        className="field mt-1"
                        type="time"
                        value={editEnd}
                        onChange={(e) => setEditEnd(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="btn btn-primary px-3 py-2 text-sm"
                      disabled={busy}
                    >
                      Speichern
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost px-3 py-2 text-sm"
                      onClick={() => setEditing(null)}
                    >
                      Zurück
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ background: p.color }}
                      />
                      <strong>{p.name}</strong>
                    </div>
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">
                      Arbeitszeit {p.work_start ?? "08:00"}–{p.work_end ?? "16:00"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost px-3 py-2 text-sm"
                      onClick={() => {
                        setEditing(p.id);
                        setEditName(p.name);
                        setEditStart(p.work_start ?? "08:00");
                        setEditEnd(p.work_end ?? "16:00");
                      }}
                    >
                      Ändern
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost px-3 py-2 text-sm text-[var(--leave)]"
                      disabled={busy}
                      onClick={() => void onRemove(p.id)}
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim();
            if (!n) return;
            void onAdd(n, workStart, workEnd).then(() => {
              setName("");
              setWorkStart("08:00");
              setWorkEnd("16:00");
            });
          }}
        >
          <input
            className="field"
            placeholder="Neuer Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-[var(--ink-soft)]">
              Arbeitszeit von
              <input
                className="field mt-1"
                type="time"
                value={workStart}
                onChange={(e) => setWorkStart(e.target.value)}
              />
            </label>
            <label className="text-xs font-semibold text-[var(--ink-soft)]">
              bis
              <input
                className="field mt-1"
                type="time"
                value={workEnd}
                onChange={(e) => setWorkEnd(e.target.value)}
              />
            </label>
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !name.trim()}
          >
            Hinzufügen
          </button>
        </form>
      </div>
    </div>
  );
}

function ReservationModal({
  initialDate,
  busy,
  onClose,
  onSubmit,
}: {
  initialDate: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: {
    reservation_date: string;
    reservation_time: string;
    guest_count: number;
    guest_name: string;
    note: string;
  }) => Promise<void>;
}) {
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState("19:00");
  const [guests, setGuests] = useState(2);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="res-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 id="res-title" className="brand-title text-2xl">
              Reservierung
            </h3>
            <p className="text-sm text-[var(--ink-soft)]">
              Datum, Uhrzeit, Gästezahl und Name — damit klar ist, wann wie
              viel los ist.
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
              reservation_date: date,
              reservation_time: time,
              guest_count: guests,
              guest_name: name.trim(),
              note: note.trim(),
            });
          }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              Datum
              <input
                className="field mt-1"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm font-semibold">
              Uhrzeit
              <input
                className="field mt-1"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </label>
          </div>
          <label className="block text-sm font-semibold">
            Gästezahl
            <input
              className="field mt-1"
              type="number"
              min={1}
              max={200}
              value={guests}
              onChange={(e) => setGuests(Number(e.target.value) || 1)}
              required
            />
          </label>
          <label className="block text-sm font-semibold">
            Name
            <input
              className="field mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name / Firma"
              required
            />
          </label>
          <label className="block text-sm font-semibold">
            Notiz / was
            <input
              className="field mt-1"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="z. B. Fenster, Geburtstag, Business"
            />
          </label>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || !name.trim()}
            >
              Speichern
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Schließen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
