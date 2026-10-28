import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";

type Guard = (proceed: () => void) => boolean;

type LeaveGuardValue = {
  setGuard: (guard: Guard | null) => void;
  tryLeave: (action: () => void) => void;
};

const LeaveGuardContext = createContext<LeaveGuardValue>({
  setGuard: () => undefined,
  tryLeave: (action) => action(),
});

export function LeaveGuardProvider({ children }: { children: ReactNode }) {
  const guardRef = useRef<Guard | null>(null);
  const setGuard = useCallback((guard: Guard | null) => {
    guardRef.current = guard;
  }, []);
  const tryLeave = useCallback((action: () => void) => {
    if (guardRef.current?.(action)) {
      return;
    }
    action();
  }, []);
  const value = useMemo(() => ({ setGuard, tryLeave }), [setGuard, tryLeave]);
  return <LeaveGuardContext.Provider value={value}>{children}</LeaveGuardContext.Provider>;
}

export function useLeaveGuard() {
  return useContext(LeaveGuardContext);
}
