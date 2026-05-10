import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  LayoutDashboard, FileText, Stamp, Users,
  Wallet, LogOut, Menu, X, UserCircle,
  Settings, BarChart2, TrendingDown, Building2,
  Banknote, CreditCard, DollarSign, RotateCcw,
  ClipboardList, Briefcase
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import NotificationBell from '../components/NotificationBell';
import GlobalSearch from '../components/GlobalSearch';

const NAV = [
  { to: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'core' },
  { to: 'passports', label: 'Passports', icon: Stamp, group: 'core' },
  { to: 'visa', label: 'Visa', icon: FileText, group: 'core' },
  { to: 'candidates', label: 'Candidates', icon: Users, group: 'core' },
  { to: 'agents', label: 'Agents', icon: UserCircle, group: 'core' },
  { to: 'employees', label: 'Employees', icon: Briefcase, group: 'core' },
  { to: 'accounts', label: 'Accounts', icon: Wallet, group: 'finance' },
  { to: 'expenses', label: 'Expenses', icon: TrendingDown, group: 'finance' },
  { to: 'vendors', label: 'Vendors', icon: Building2, group: 'finance' },
  { to: 'loans', label: 'Loans', icon: Banknote, group: 'finance' },
  { to: 'payroll', label: 'Payroll', icon: CreditCard, group: 'finance' },
  { to: 'cheques', label: 'Cheques', icon: DollarSign, group: 'finance' },
  { to: 'refunds', label: 'Refunds', icon: RotateCcw, group: 'finance' },
  { to: 'reports', label: 'Reports', icon: BarChart2, group: 'analytics' },
  { to: 'audit-log', label: 'Audit Log', icon: ClipboardList, group: 'analytics' },
];

const BOTTOM_NAV = [
  { to: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { to: 'passports', label: 'Passports', icon: Stamp },
  { to: 'candidates', label: 'Candidates', icon: Users },
  { to: 'visa', label: 'Visa', icon: FileText },
  { to: 'accounts', label: 'Accounts', icon: Wallet },
];

const navClass = (isActive) => `
  flex items-center gap-4 px-4 py-3.5 rounded-xl text-sm font-medium transition-colors border
  ${isActive
    ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/50'
    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border-transparent'
  }
`;

// Focusable elements we want to include in the focus trap
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export default function AppLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const isAgent = profile?.role === 'agent';

  // FIX: ref for the slide-out panel so we can trap focus inside it.
  const menuPanelRef = useRef(null);

  const agentNav = NAV.filter(n => ['dashboard', 'candidates', 'passports', 'accounts'].includes(n.to));
  const agentBottom = BOTTOM_NAV.filter(n => ['dashboard', 'candidates', 'passports', 'accounts'].includes(n.to));

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const closeMenu = () => setMenuOpen(false);

  // ── Focus trap + Escape key ────────────────────────────────────────────────
  // FIX: Without a focus trap, pressing Tab while the mobile menu is open moves
  // focus into the content behind the overlay — confusing for keyboard and
  // screen-reader users, and a WCAG 2.1 2.1.2 failure.
  //
  // When the menu opens:
  //   1. Focus is moved to the first focusable element inside the panel.
  //   2. Tab / Shift-Tab are intercepted to cycle within the panel only.
  //   3. Escape closes the menu and returns focus to the hamburger button.
  const hamburgerRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;

    const panel = menuPanelRef.current;
    if (!panel) return;

    // Collect all focusable elements in the panel at the time it opens.
    const getFocusable = () =>
      Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
        el => !el.closest('[aria-hidden="true"]') && el.offsetParent !== null
      );

    // Move initial focus into the panel.
    const focusable = getFocusable();
    focusable[0]?.focus();

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        closeMenu();
        // Return focus to the button that opened the menu.
        hamburgerRef.current?.focus();
        return;
      }

      if (e.key !== 'Tab') return;

      // Re-query on every Tab press so dynamically-added elements are included.
      const els = getFocusable();
      if (els.length === 0) return;

      const first = els[0];
      const last  = els.at(-1);

      if (e.shiftKey) {
        // Shift-Tab: if we're on the first element, wrap to the last.
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if we're on the last element, wrap to the first.
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-[#05030A] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#08050F] border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="text-white font-bold text-xl">Bhuiyan Books</div>
        </div>

        <div className="flex items-center gap-3">
          <GlobalSearch />
          <NotificationBell />
          <button
            ref={hamburgerRef}
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-slate-400 hover:text-slate-200 p-1.5"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <div
        role="dialog"
        id="mobile-nav"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`fixed inset-0 z-50 bg-black/80 transition-all ${menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={closeMenu}
      >
        {/* Slide-out panel — stopPropagation prevents the overlay click from
            firing when clicking inside the panel itself. The focus trap is
            attached to this element via menuPanelRef. */}
        <div
          ref={menuPanelRef}
          className="fixed inset-y-0 right-0 w-64 bg-[#08050F] border-l border-slate-800 p-5 overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="presentation"
        >
          <div className="flex justify-between items-center mb-8">
            <div className="text-white font-bold text-2xl">Bhuiyan Books</div>
            <button onClick={closeMenu} aria-label="Close menu">
              <X size={24} className="text-slate-400" />
            </button>
          </div>

          {/* User Profile */}
          <div className="mb-8">
            <div className="flex items-center gap-3">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Avatar"
                  className="w-10 h-10 rounded-full object-cover border border-slate-700"
                />
              ) : (
                <UserCircle size={40} className="text-slate-500" aria-hidden="true" />
              )}
              <div>
                <p className="font-semibold text-white">{profile?.full_name}</p>
                <p className="text-xs text-slate-500 capitalize">{profile?.role}</p>
              </div>
            </div>
          </div>

          {/* Core Navigation */}
          <div className="mb-8">
            <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-4 mb-2">Core</div>
            <nav className="flex flex-col gap-1">
              {(isAgent ? agentNav : NAV.filter(n => n.group === 'core')).map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={closeMenu}
                  className={({ isActive }) => navClass(isActive)}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>
          </div>

          {/* Finance & Analytics — hidden for agents */}
          {!isAgent && (
            <>
              <div className="mb-8">
                <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-4 mb-2">Finance</div>
                <nav className="flex flex-col gap-1">
                  {NAV.filter(n => n.group === 'finance').map(({ to, label, icon: Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      onClick={closeMenu}
                      className={({ isActive }) => navClass(isActive)}
                    >
                      <Icon size={18} />
                      <span>{label}</span>
                    </NavLink>
                  ))}
                </nav>
              </div>

              <div className="mb-8">
                <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-4 mb-2">Analytics</div>
                <nav className="flex flex-col gap-1">
                  {NAV.filter(n => n.group === 'analytics').map(({ to, label, icon: Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      onClick={closeMenu}
                      className={({ isActive }) => navClass(isActive)}
                    >
                      <Icon size={18} />
                      <span>{label}</span>
                    </NavLink>
                  ))}
                </nav>
              </div>
            </>
          )}

          {/* Bottom Actions */}
          <div className="pt-6 border-t border-slate-800">
            <NavLink
              to="/profile"
              onClick={closeMenu}
              className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white rounded-xl"
            >
              <Settings size={18} />
              Profile &amp; Settings
            </NavLink>

            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl mt-2"
            >
              <LogOut size={18} />
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 px-4 py-6 max-w-7xl mx-auto w-full pb-24">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#08050F] border-t border-slate-800 px-2 py-2">
        <div className="flex justify-around">
          {(isAgent ? agentBottom : BOTTOM_NAV).map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `
                flex flex-col items-center gap-1 py-1 px-3 rounded-lg transition-colors text-xs
                ${isActive ? 'text-indigo-400' : 'text-slate-500'}
              `}
            >
              <Icon size={20} />
              <span className="font-medium">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
