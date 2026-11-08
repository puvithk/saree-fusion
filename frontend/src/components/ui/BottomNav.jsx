import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Palette, LayoutGrid, Layers3, Menu } from 'lucide-react';
import { haptic } from '../../utils/haptics';

const TABS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/design', label: 'Design', icon: Palette },
  { to: '/simulation', label: 'Studio', icon: Layers3 },
  { to: '/collections', label: 'Collection', icon: LayoutGrid },
];

/** Sticky bottom tab bar for phones/tablets (hidden on desktop). */
export default function BottomNav({ onMore, moreOpen }) {
  const { pathname } = useLocation();
  const item = 'sf-tap relative flex min-h-[62px] flex-1 flex-col items-center justify-center gap-1 px-0.5 pt-1 text-[10.5px] font-medium leading-none';

  return createPortal(
    <nav aria-label="Bottom navigation"
      className="fixed inset-x-0 bottom-0 z-[150] border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl min-[1101px]:hidden">
      <div className="mx-auto flex max-w-2xl items-stretch gap-0.5 px-2">
        {TABS.map(({ to, label, icon: Icon, end }) => {
          const active = end ? pathname === to : pathname.startsWith(to);
          return (
            <NavLink key={to} to={to} end={end} onClick={() => haptic(8)}
              className={`${item} ${active ? 'text-gold' : 'text-muted'}`}>
              {active && <span className="absolute top-0 h-[3px] w-8 rounded-b-full bg-gold" />}
              <Icon size={22} strokeWidth={active ? 2.4 : 1.9} />
              {label}
            </NavLink>
          );
        })}
        <button type="button" onClick={() => { haptic(8); onMore(); }} aria-expanded={moreOpen} aria-label="More menu"
          className={`${item} ${moreOpen ? 'text-gold' : 'text-muted'}`}>
          <Menu size={22} />
          More
        </button>
      </div>
    </nav>,
    document.body,
  );
}
