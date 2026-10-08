import React, {
  createContext,
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
  const [handlers, setHandlers] = useState<QuickActionHandlers | undefined>(undefined);
  const value = useMemo(() => ({ handlers, setHandlers }), [handlers]);
  return (
    <QuickActionsContext.Provider value={value}>{children}</QuickActionsContext.Provider>
  );
}

/** Register page-specific quick-action handlers while mounted. */
export function useQuickActionHandlers(handlers: QuickActionHandlers) {
  const ctx = useContext(QuickActionsContext);
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!ctx) return;
    const proxy: QuickActionHandlers = {
      onWork: () => ref.current.onWork?.(),
      onExpense: () => ref.current.onExpense?.(),
      onAdvance: () => ref.current.onAdvance?.(),
      onPdf: () => ref.current.onPdf?.(),
    };
    ctx.setHandlers(proxy);
    return () => ctx.setHandlers(undefined);
  }, [ctx]);
}

export function useQuickActionsContext() {
  return useContext(QuickActionsContext);
}
