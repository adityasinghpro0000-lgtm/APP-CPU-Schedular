/**
 * CPU Scheduling Simulator - Accessibility and theme manager.
 */
(function() {
  const STORAGE_KEYS = {
    theme: 'cpu-simulator-theme',
    textSize: 'cpu-simulator-text-size',
    zoom: 'cpu-simulator-zoom',
    contrast: 'cpu-simulator-contrast'
  };

  function storageKey(key) {
    if (new URLSearchParams(window.location.search).get('demo') === '1') return `${key}-demo`;
    const profileId = window.ProfileManager?.getStorageScope?.() || 'default';
    return `${key}-${profileId}`;
  }

  function applyPreferences() {
    const docEl = document.documentElement;
    const isDark = localStorage.getItem(storageKey(STORAGE_KEYS.theme)) === 'dark';
    docEl.classList.toggle('dark', isDark);
    docEl.classList.toggle('light', !isDark);

    const themeBtn = document.querySelector('#themeToggle');
    if (themeBtn) {
      const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';
      themeBtn.setAttribute('aria-pressed', String(isDark));
      themeBtn.setAttribute('title', label);
      themeBtn.setAttribute('aria-label', label);
      themeBtn.querySelector('[data-lucide], svg')?.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
    }
    document.querySelector('#themeColor')?.setAttribute('content', isDark ? '#171918' : '#f4f1ea');

    const textSize = localStorage.getItem(storageKey(STORAGE_KEYS.textSize)) || 'normal';
    docEl.classList.toggle('text-small', textSize === 'small');
    docEl.classList.toggle('text-large', textSize === 'large');
    document.querySelectorAll('[data-text-size]').forEach(button => {
      const selected = button.dataset.textSize === textSize;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });

    const savedZoom = parseFloat(localStorage.getItem(storageKey(STORAGE_KEYS.zoom)) || '1');
    const zoom = isNaN(savedZoom) ? 1 : Math.min(1.3, Math.max(0.7, Math.round(savedZoom * 10) / 10));
    document.body.style.zoom = zoom;
    const zoomDisplay = document.querySelector('#zoomValue');
    if (zoomDisplay) zoomDisplay.textContent = `${Math.round(zoom * 100)}%`;

    const contrast = localStorage.getItem(storageKey(STORAGE_KEYS.contrast)) || 'normal';
    docEl.classList.toggle('high-contrast', contrast === 'high');
    document.querySelectorAll('[data-contrast]').forEach(button => {
      const selected = button.dataset.contrast === contrast;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    window.lucide?.createIcons?.();
  }

  function resetAccessibilityPrefs() {
    localStorage.setItem(storageKey(STORAGE_KEYS.textSize), 'normal');
    localStorage.setItem(storageKey(STORAGE_KEYS.zoom), '1');
    localStorage.setItem(storageKey(STORAGE_KEYS.contrast), 'normal');
    applyPreferences();
  }

  function closePanel(panel, toggle) {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }

  function syncSidebarToPageScroll() {
    const sidebar = document.querySelector('.sidebar, .workspace-menu');
    if (!sidebar) return;
    let scheduled = false;
    const sync = () => {
      scheduled = false;
      const pageRange = document.documentElement.scrollHeight - window.innerHeight;
      const sidebarRange = sidebar.scrollHeight - sidebar.clientHeight;
      if (pageRange <= 0 || sidebarRange <= 0) return;
      const progress = Math.min(1, Math.max(0, window.scrollY / pageRange));
      sidebar.scrollTop = progress * sidebarRange;
    };
    const onScroll = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(sync);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', sync);
    sync();
  }

  function initAccessibility() {
    applyPreferences();
    syncSidebarToPageScroll();
    const panel = document.querySelector('#accessibilityPanel');
    const toggle = document.querySelector('#accessibilityToggle');
    if (panel && toggle) {
      toggle.addEventListener('click', event => {
        event.stopPropagation();
        const willOpen = panel.hidden;
        panel.hidden = !willOpen;
        toggle.setAttribute('aria-expanded', String(willOpen));
        if (willOpen) panel.querySelector('button')?.focus();
      });
      document.addEventListener('click', event => {
        if (!panel.hidden && !panel.contains(event.target) && !toggle.contains(event.target)) closePanel(panel, toggle);
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !panel.hidden) {
          closePanel(panel, toggle);
          toggle.focus();
        }
      });
    }

    document.querySelectorAll('[data-text-size]').forEach(button => button.addEventListener('click', () => {
      localStorage.setItem(storageKey(STORAGE_KEYS.textSize), button.dataset.textSize);
      applyPreferences();
    }));
    document.querySelectorAll('[data-zoom]').forEach(button => button.addEventListener('click', () => {
      const current = parseFloat(localStorage.getItem(storageKey(STORAGE_KEYS.zoom)) || '1');
      const delta = button.dataset.zoom === 'increase' ? 0.1 : -0.1;
      localStorage.setItem(storageKey(STORAGE_KEYS.zoom), String(Math.min(1.3, Math.max(0.7, Math.round((current + delta) * 10) / 10))));
      applyPreferences();
    }));
    document.querySelectorAll('[data-contrast]').forEach(button => button.addEventListener('click', () => {
      localStorage.setItem(storageKey(STORAGE_KEYS.contrast), button.dataset.contrast);
      applyPreferences();
    }));
    document.querySelector('#accessibilityReset')?.addEventListener('click', resetAccessibilityPrefs);
    document.querySelector('#themeToggle')?.addEventListener('click', () => {
      const nextDark = !document.documentElement.classList.contains('dark');
      localStorage.setItem(storageKey(STORAGE_KEYS.theme), nextDark ? 'dark' : 'light');
      applyPreferences();
    });
    window.addEventListener('storage', event => {
      if (Object.values(STORAGE_KEYS).some(key => event.key?.startsWith(`${key}-`))) applyPreferences();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAccessibility);
  else initAccessibility();
  window.A11yManager = { applyPreferences, resetAccessibilityPrefs, STORAGE_KEYS };
})();
