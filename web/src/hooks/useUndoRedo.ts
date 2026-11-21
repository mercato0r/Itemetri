import { useCallback, useState } from "react";

const MAX_HISTORY = 50;

interface HistoryState<T> {
  past: T[];
  present: T | null;
  future: T[];
}

export function useUndoRedo<T>(initialValue: T | null = null) {
  const [state, setState] = useState<HistoryState<T>>({
    past: [],
    present: initialValue,
    future: [],
  });

  const reset = useCallback((next: T | null) => {
    setState({ past: [], present: next, future: [] });
  }, []);

  const commit = useCallback((updater: T | ((current: T) => T)) => {
    setState((curr) => {
      if (curr.present === null) {
        if (typeof updater === "function") return curr;
        return { past: [], present: updater, future: [] };
      }
      const next =
        typeof updater === "function"
          ? (updater as (c: T) => T)(curr.present)
          : updater;
      if (next === curr.present) return curr;
      return {
        past: [...curr.past.slice(-(MAX_HISTORY - 1)), curr.present],
        present: next,
        future: [],
      };
    });
  }, []);

  const undo = useCallback(() => {
    setState((curr) => {
      if (curr.past.length === 0 || curr.present === null) return curr;
      const previous = curr.past[curr.past.length - 1];
      if (previous === undefined) return curr;
      return {
        past: curr.past.slice(0, -1),
        present: previous,
        future: [curr.present, ...curr.future.slice(0, MAX_HISTORY - 1)],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((curr) => {
      if (curr.future.length === 0 || curr.present === null) return curr;
      const next = curr.future[0];
      if (next === undefined) return curr;
      return {
        past: [...curr.past.slice(-(MAX_HISTORY - 1)), curr.present],
        present: next,
        future: curr.future.slice(1),
      };
    });
  }, []);

  return {
    present: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    reset,
    commit,
    undo,
    redo,
  };
}
