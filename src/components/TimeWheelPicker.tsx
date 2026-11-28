"use client";

import { useEffect, useRef } from "react";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const ITEM_H = 40;
const VISIBLE = 5;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseTime(value: string): { h: number; m: number } {
  const [hs, ms] = value.split(":");
  const h = Math.min(23, Math.max(0, Number(hs) || 0));
  const rawM = Math.min(59, Math.max(0, Number(ms) || 0));
  // Snap to nearest 5-minute step
  const m = Math.round(rawM / 5) * 5;
  return { h, m: m === 60 ? 0 : m };
}

function WheelColumn({
  values,
  selected,
  onChange,
  ariaLabel,
  format = pad2,
}: {
  values: number[];
  selected: number;
  onChange: (v: number) => void;
  ariaLabel: string;
  format?: (n: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ignoreScroll = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, values.indexOf(selected));
    ignoreScroll.current = true;
    el.scrollTop = idx * ITEM_H;
    const t = setTimeout(() => {
      ignoreScroll.current = false;
    }, 80);
    return () => clearTimeout(t);
  }, [selected, values]);

  function snapToNearest() {
    const el = ref.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(values.length - 1, idx));
    const next = values[clamped]!;
    ignoreScroll.current = true;
    el.scrollTo({ top: clamped * ITEM_H, behavior: "smooth" });
    if (next !== selected) onChange(next);
    setTimeout(() => {
      ignoreScroll.current = false;
    }, 160);
  }

  return (
    <div className="time-wheel-col" aria-label={ariaLabel}>
      <div
        ref={ref}
        className="time-wheel-scroll"
        role="listbox"
        aria-label={ariaLabel}
        tabIndex={0}
        onScroll={() => {
          if (ignoreScroll.current) return;
          if (settleTimer.current) clearTimeout(settleTimer.current);
          settleTimer.current = setTimeout(snapToNearest, 90);
        }}
        onKeyDown={(e) => {
          const idx = values.indexOf(selected);
          if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
            e.preventDefault();
            const next = values[Math.max(0, idx - 1)];
            if (next != null) onChange(next);
          } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
            e.preventDefault();
            const next = values[Math.min(values.length - 1, idx + 1)];
            if (next != null) onChange(next);
          }
        }}
      >
        <div className="time-wheel-pad" aria-hidden />
        {values.map((v) => (
          <div
            key={v}
            role="option"
            aria-selected={v === selected}
            className={`time-wheel-item${v === selected ? " is-selected" : ""}`}
          >
            {format(v)}
          </div>
        ))}
        <div className="time-wheel-pad" aria-hidden />
      </div>
    </div>
  );
}

export default function TimeWheelPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
}) {
  const { h, m } = parseTime(value);

  function emit(nextH: number, nextM: number) {
    onChange(`${pad2(nextH)}:${pad2(nextM)}`);
  }

  return (
    <div className="time-wheel" role="group" aria-label={label ?? "Uhrzeit"}>
      {label ? <span className="time-wheel-label">{label}</span> : null}
      <div className="time-wheel-face">
        <div className="time-wheel-highlight" aria-hidden />
        <WheelColumn
          values={HOURS}
          selected={h}
          onChange={(nh) => emit(nh, m)}
          ariaLabel="Stunden"
        />
        <span className="time-wheel-colon" aria-hidden>
          :
        </span>
        <WheelColumn
          values={MINUTES}
          selected={m}
          onChange={(nm) => emit(h, nm)}
          ariaLabel="Minuten"
        />
      </div>
      <span className="sr-only">
        {pad2(h)}:{pad2(m)}
      </span>
    </div>
  );
}

export const TIME_WHEEL_ITEM_H = ITEM_H;
export const TIME_WHEEL_VISIBLE = VISIBLE;
