// The customer's Monthly / One-time choice, kept for this browser session only.
// Storage can be unavailable (private mode, blocked site data), so every access is guarded.

const KEY = 'saafgadi.dashboardTab';

export function readDashboardTab(): 'monthly' | 'one-time' | null {
  try {
    const v = sessionStorage.getItem(KEY);
    return v === 'monthly' || v === 'one-time' ? v : null;
  } catch {
    return null;
  }
}

export function writeDashboardTab(tab: 'monthly' | 'one-time') {
  try {
    sessionStorage.setItem(KEY, tab);
  } catch {
    /* not stored; auto-select next time */
  }
}

/** On log in / log out, so the next session auto-selects again. */
export function clearDashboardTab() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
}
