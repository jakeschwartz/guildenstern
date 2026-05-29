// "Threads" header per spec §5 — deliberate step off iMessage's "Messages".
// Affordances live where Edit / ⊕ would be on iOS Messages: Filter · New · Menu.

type Props = {
  onFilter?: () => void;
  onNew?: () => void;
  onMenu?: () => void;
};

export const InboxHeader = ({ onFilter, onNew, onMenu }: Props) => (
  <header className="px-5 pt-3 pb-3 border-b border-rule flex items-baseline justify-between">
    <h1 className="text-[22px] font-semibold tracking-tight text-ink">
      Threads
    </h1>
    <div className="flex items-baseline gap-3 text-[12.5px] text-muted">
      <button onClick={onFilter} className="hover:text-ink transition-colors">
        Filter
      </button>
      <span className="opacity-50">·</span>
      <button onClick={onNew} className="hover:text-ink transition-colors">
        New
      </button>
      {onMenu && (
        <>
          <span className="opacity-50">·</span>
          <button onClick={onMenu} className="hover:text-ink transition-colors">
            Menu
          </button>
        </>
      )}
    </div>
  </header>
);
