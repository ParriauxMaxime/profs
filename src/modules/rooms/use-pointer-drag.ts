import { useCallback, useEffect, useRef, useState } from "react";

/** How far a mouse must travel before a press becomes a drag. */
const MOVE_THRESHOLD = 5;

/** How long a finger must rest before a press becomes a drag. */
const HOLD_MS = 250;

interface Point {
  clientX: number;
  clientY: number;
}

interface PointerDragOptions<T> {
  /** The drag began: `payload` is now in hand, at this point. */
  onStart: (payload: T, at: Point) => void;
  /** The pointer moved while dragging. */
  onMove: (payload: T, at: Point) => void;
  /** The pointer was released while dragging: drop here. */
  onDrop: (payload: T, at: Point) => void;
  /** The gesture was abandoned — the browser took it, or the pointer was lost. */
  onCancel: (payload: T) => void;
}

interface Gesture<T> {
  payload: T;
  pointerId: number;
  startX: number;
  startY: number;
  touch: boolean;
  started: boolean;
  holdTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * Dragging that works with a finger, which HTML5 drag and drop does not.
 *
 * `draggable` + `dragstart` has no touch implementation anywhere: not in
 * Chrome's device emulation, and not on a real tablet, where a finger never
 * fires a drag event at all. The salle editor's drag was therefore
 * mouse-only — on the device this app is actually for, the tap path was not
 * drag's equivalent, it was the only gesture there was, and the table palette
 * (drag-only) could not add a table at all.
 *
 * Pointer events cover mouse, pen and touch in one code path, and — unlike
 * HTML5 drag — they can be SYNTHESISED, so this is the first gesture on this
 * screen a browser test can actually drive.
 *
 * **A press is not yet a drag**, and the wait differs by pointer type. A mouse
 * has a cursor and no other use for a press, so it drags as soon as it has
 * moved `MOVE_THRESHOLD`. A finger's press is ambiguous — the room scrolls
 * when it is wider than the screen — so it must rest `HOLD_MS` first, and any
 * movement before that belongs to the browser: the gesture is abandoned and
 * the page scrolls. That is why `touch-action` is left alone on the tiles;
 * pinning it to `none` would buy an instant drag by making a swipe that starts
 * on a table unable to scroll anything.
 *
 * Once dragging HAS begun, `touchmove` is cancelled for the rest of the
 * gesture, or the browser would start panning mid-drag and take the pointer
 * away as a `pointercancel`.
 *
 * Movement is tracked on the DOCUMENT rather than through
 * `setPointerCapture`: capture refuses a pointer id it has no live pointer
 * for, which is exactly the case when a test dispatches the sequence.
 */
export function usePointerDrag<T>(options: PointerDragOptions<T>): {
  /** Call from `onPointerDown` on anything draggable. */
  begin: (event: React.PointerEvent, payload: T) => void;
  /** True once the press has become a drag. */
  dragging: boolean;
} {
  // Read through a ref so a gesture's listeners survive a re-render without
  // being torn down and rebuilt underneath it.
  const handlers = useRef(options);
  handlers.current = options;

  const gesture = useRef<Gesture<T> | null>(null);
  const [dragging, setDragging] = useState(false);

  const start = useCallback((at: Point) => {
    const active = gesture.current;
    if (!active || active.started) return;
    if (active.holdTimer !== null) clearTimeout(active.holdTimer);
    active.holdTimer = null;
    active.started = true;
    setDragging(true);
    handlers.current.onStart(active.payload, at);
  }, []);

  const finish = useCallback((outcome: "drop" | "cancel", at: Point | null) => {
    const active = gesture.current;
    if (!active) return;
    if (active.holdTimer !== null) clearTimeout(active.holdTimer);
    gesture.current = null;
    setDragging(false);
    // A press that never became a drag is a TAP, and taps are the click
    // handler's business — reporting it here would place a table on every
    // pick-up.
    if (!active.started) return;
    if (outcome === "drop" && at) handlers.current.onDrop(active.payload, at);
    else handlers.current.onCancel(active.payload);
  }, []);

  useEffect(() => {
    function onPointerMove(event: PointerEvent): void {
      const active = gesture.current;
      if (!active || event.pointerId !== active.pointerId) return;
      const far =
        Math.abs(event.clientX - active.startX) > MOVE_THRESHOLD ||
        Math.abs(event.clientY - active.startY) > MOVE_THRESHOLD;

      if (!active.started) {
        // A finger that moves before the hold is scrolling, not dragging: let
        // the browser have the gesture rather than fighting it for one the
        // teacher did not mean.
        if (active.touch) {
          if (far) finish("cancel", null);
          return;
        }
        if (!far) return;
        start(event);
      }
      handlers.current.onMove(active.payload, event);
    }

    function onPointerUp(event: PointerEvent): void {
      if (event.pointerId !== gesture.current?.pointerId) return;
      finish("drop", event);
    }

    function onPointerCancel(event: PointerEvent): void {
      if (event.pointerId !== gesture.current?.pointerId) return;
      finish("cancel", null);
    }

    // Non-passive, because its whole job is to refuse the browser's pan once
    // the table is in hand.
    function onTouchMove(event: TouchEvent): void {
      if (gesture.current?.started) event.preventDefault();
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerCancel);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerCancel);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, [finish, start]);

  const begin = useCallback(
    (event: React.PointerEvent, payload: T) => {
      // The primary button only, and never a second pointer mid-gesture.
      if (event.button !== 0 || gesture.current !== null) return;
      const touch = event.pointerType !== "mouse";
      const at = { clientX: event.clientX, clientY: event.clientY };
      gesture.current = {
        payload,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        touch,
        started: false,
        holdTimer: touch ? setTimeout(() => start(at), HOLD_MS) : null,
      };
    },
    [start],
  );

  return { begin, dragging };
}
