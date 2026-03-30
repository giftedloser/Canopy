import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

const round2 = (value: number) => Math.round(value * 100) / 100;

function isValidWidths(
  input: unknown,
  expectedLength: number,
  minWidths: number[]
): input is number[] {
  if (!Array.isArray(input) || input.length !== expectedLength) return false;
  return input.every((value, idx) => (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minWidths[idx]
  ));
}

export function useResizablePercentColumns(
  storageKey: string,
  defaultWidths: readonly number[],
  minWidths?: readonly number[]
) {
  const tableRef = useRef<HTMLTableElement | null>(null);
  const mins = useMemo(
    () => (minWidths ? minWidths.slice() : defaultWidths.map(() => 6)),
    [minWidths, defaultWidths]
  );
  const [widths, setWidths] = useState<number[]>(() => defaultWidths.slice());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (isValidWidths(parsed, defaultWidths.length, mins)) {
        setWidths(parsed.map((value) => round2(value)));
      }
    } catch {
      // ignore invalid persisted data
    }
  }, [storageKey, defaultWidths.length, mins]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(widths));
    } catch {
      // storage can fail in restricted environments
    }
  }, [storageKey, widths]);

  const startResize = useCallback((index: number, event: ReactMouseEvent) => {
    if (index < 0 || index >= widths.length - 1) return;

    event.preventDefault();
    event.stopPropagation();

    const tableWidth = tableRef.current?.getBoundingClientRect().width ?? 0;
    if (tableWidth <= 0) return;

    const startX = event.clientX;
    const startWidths = widths.slice();
    const leftStart = startWidths[index];
    const rightStart = startWidths[index + 1];
    const pairTotal = leftStart + rightStart;
    const leftMin = mins[index] ?? 6;
    const rightMin = mins[index + 1] ?? 6;

    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - startX;
      const deltaPct = (deltaPx / tableWidth) * 100;

      const minLeft = leftMin;
      const maxLeft = pairTotal - rightMin;
      const nextLeft = Math.max(minLeft, Math.min(maxLeft, leftStart + deltaPct));
      const nextRight = pairTotal - nextLeft;

      setWidths((current) => {
        const next = current.slice();
        next[index] = round2(nextLeft);
        next[index + 1] = round2(nextRight);
        return next;
      });
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [mins, widths]);

  return { tableRef, widths, setWidths, startResize };
}
