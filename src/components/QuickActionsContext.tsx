import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { QuickActionHandlers } from './QuickActionsBar';

type Ctx = {
  handlers: QuickActionHandlers | undefined;
  setHandlers: (h: QuickActionHandlers | undefined) => void;
};

const QuickActionsContext = createContext<Ctx | null>(null);

export function QuickActionsProvider({ children }: { children: React.ReactNode }) {
  const [handlers, setHandlersState] = useState<QuickActionHandlers | undefined>(undefined);
  // Stable setter so consumers can depend on it without re-firing effects.
  const setHandlers = useCallback((h: QuickActionHandlers | undefined) => {
    setHandlersState(h);
  }, []);
  const value = useMemo(() => ({ handlers, setHandlers }), [handlers, setHandlers]);
  return (
    <QuickActionsContext.Provider value={value}>{children}</QuickActionsContext.Provider>
  );
}

/** Register page-specific quick-action handlers while mounted. */
export function useQuickActionHandlers(handlers: QuickActionHandlers) {
  const ctx = useContext(QuickActionsContext);
  const setHandlers = ctx?.setHandlers;
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!setHandlers) return;
    const proxy: QuickActionHandlers = {
      onWork: () => ref.current.onWork?.(),
      onExpense: () => ref.current.onExpense?.(),
      onAdvance: () => ref.current.onAdvance?.(),
      onPdf: () => ref.current.onPdf?.(),
    };
    setHandlers(proxy);
    return () => setHandlers(undefined);
    // Intentionally only depend on stable setHandlers — NOT the whole ctx object
    // (ctx identity changes when handlers update and would cause an infinite loop).
  }, [setHandlers]);
}

export function useQuickActionsContext() {
  return useContext(QuickActionsContext);
}
