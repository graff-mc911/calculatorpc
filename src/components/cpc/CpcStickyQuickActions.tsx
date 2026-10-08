import { QuickActionsBar, type QuickActionHandlers } from '../QuickActionsBar';

type Props = {
  handlers?: QuickActionHandlers;
};

/** Fixed quick-actions strip above BottomNav + FAB (visual spec). */
export function CpcStickyQuickActions({ handlers }: Props) {
  return (
    <>
      <div
        className="fixed inset-x-0 z-40 px-3 pointer-events-none no-print"
        style={{ bottom: 'calc(78px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="max-w-[430px] mx-auto pointer-events-auto">
          <QuickActionsBar handlers={handlers} />
        </div>
      </div>
      <div className="h-20" aria-hidden />
    </>
  );
}
