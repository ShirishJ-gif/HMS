import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

export function ExpenseActions({ description, items }: {
  description: string;
  items: Array<{ label: string; icon: ReactNode; onClick: () => void; danger?: boolean }>;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector('button')?.focus();
    const dismissOutside = (event: Event) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setPosition(null);
    };
    const dismissOnMove = () => setPosition(null);
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    window.addEventListener('resize', dismissOnMove);
    window.addEventListener('scroll', dismissOnMove, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
      window.removeEventListener('resize', dismissOnMove);
      window.removeEventListener('scroll', dismissOnMove, true);
    };
  }, [position]);

  function open() {
    if (position) { setPosition(null); return; }
    const rect = trigger.current!.getBoundingClientRect();
    const height = items.length * 40 + 10;
    setPosition({
      top: rect.bottom + height + 8 > window.innerHeight ? Math.max(8, rect.top - height - 4) : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - 184, window.innerWidth - 192)),
    });
  }

  return <>
    <button ref={trigger} type="button" aria-label={`Actions for ${description}`} aria-haspopup="menu" aria-expanded={Boolean(position)} aria-controls={position ? id : undefined} onClick={open} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); if (!position) open(); } }} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
      <MoreHorizontal size={19} />
    </button>
    {position && createPortal(<div id={id} ref={menu} role="menu" aria-label={`Actions for ${description}`} style={position} className="fixed z-50 w-[184px] rounded-xl border border-slate-200 bg-white p-1 shadow-lg" onKeyDown={event => {
      const buttons = Array.from(menu.current?.querySelectorAll('button') ?? []);
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault(); setPosition(null); trigger.current?.focus();
      } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    }}>
      {items.map(item => <button key={item.label} type="button" role="menuitem" tabIndex={-1} onClick={() => { setPosition(null); trigger.current?.focus(); item.onClick(); }} className={`flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-xs font-medium outline-none ${item.danger ? 'text-rose-600 hover:bg-rose-50 focus:bg-rose-50' : 'text-slate-700 hover:bg-slate-50 focus:bg-slate-100'}`}>
        {item.icon}{item.label}
      </button>)}
    </div>, document.body)}
  </>;
}
