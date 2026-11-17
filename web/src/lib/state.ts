// Lifecycle state persisted in localStorage. Receipt-derived addresses only.
import { useCallback, useState } from "react";

export type LifecycleState = {
  configId?: string;
  token?: string;
  curve?: string;
  pool?: string;
};

const STORAGE_KEY = "ammora-launchpad-web-state";

const load = (): LifecycleState => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as LifecycleState;
  } catch {
    return {};
  }
};

export function useLifecycleState(): {
  state: LifecycleState;
  update: (patch: Partial<LifecycleState>) => void;
  reset: () => void;
} {
  const [state, setState] = useState<LifecycleState>(load);

  const update = useCallback((patch: Partial<LifecycleState>) => {
    setState((current) => {
      const next = { ...current, ...patch };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState({});
  }, []);

  return { state, update, reset };
}
