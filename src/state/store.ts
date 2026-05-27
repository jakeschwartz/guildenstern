import { useEffect, useSyncExternalStore } from "react";
import type { Partnership, Thread, User, UserId } from "../types";
import { seedPartnerships, seedThreads, seedUsers } from "./seed";

type State = {
  users: User[];
  partnerships: Partnership[];
  threads: Thread[];
  currentUserId: UserId;
};

const STORAGE_KEY = "guildenstern:v8";

const load = (): State => {
  if (typeof window === "undefined") return fresh();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw) as State;
    if (!parsed.users || !parsed.threads || !parsed.partnerships)
      return fresh();
    return parsed;
  } catch {
    return fresh();
  }
};

const fresh = (): State => ({
  users: seedUsers,
  partnerships: seedPartnerships,
  threads: seedThreads,
  currentUserId: "jake",
});

let state: State = load();
const listeners = new Set<() => void>();

const emit = () => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  listeners.forEach((l) => l());
};

export const getState = () => state;

export const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const setCurrentUser = (id: UserId) => {
  state = { ...state, currentUserId: id };
  emit();
};

export const resetState = () => {
  state = fresh();
  emit();
};

export const useStore = <T,>(selector: (s: State) => T): T =>
  useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  );

export const useHydratedReset = () => {
  useEffect(() => {
    // Surface reset for the dev console.
    (window as unknown as { __reset?: () => void }).__reset = resetState;
  }, []);
};
