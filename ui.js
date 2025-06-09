// ui.js
(function () {
  // ── TrustedTypes policy for safe SVG injection ───────────────────────────
  const ttPolicy = window.trustedTypes?.createPolicy('svgPolicy', {
    createHTML: input => input
  });

  // ── Storage key & URL flags ─────────────────────────────────────────────
  const STORAGE_KEY   = 'ytstudiotoolsEnabled';
  const isVideoPage   = /\/video\/[^/]+\/analytics\/tab-overview\/period-default(?:[\/?]|$)/.test(location.href);
  const isChannelPage = /\/(?:channel|artist)\/[^/]+\/analytics\/tab-overview\/period-default/.test(location.href);

  // ── State & assets ──────────────────────────────────────────────────────
  let lastResult  = null;
  let lastDisplay = null;
  let hasRealData = false;
  const LOGO_URL  = localStorage.getItem('ytstudiotools_logo_url') || '';

  // ── Helpers ──────────────────────────────────────────────────────────────
  function isEnabled() {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  }
  function setEnabled(v) {
    localStorage.setItem(STORAGE_KEY, v ? 'true' : 'false');
  }
  function getChannelType() {
    return localStorage.getItem('ytstudiotools_channel_type') || 'Mixed';
  }

  // ── Insert the toggle UI ─────────────────────────────────────────────────
  function insertToggle() {
    if ((!isVideoPage && !isChannelPage) ||
        document.getElementById('ytstudiotools-switch')) return;

    const host = document.querySelector('.advanced-analytics-container');
    if (!host) return;
    host.classList.add('ytstudiotools-host');

    const wrapper = document.createElement('div');
    wrapper.id = 'ytstudiotools-wrapper';

    // Logo
    if (LOGO_URL) {
      fetch(LOGO_URL).then(r => r.text()).then(svgText => {
        const safe = ttPolicy?.createHTML(svgText) ?? svgText;
        const doc  = new DOMParser().parseFromString(safe, 'image/svg+xml');
        const orig = doc.documentElement;
        const w = orig.getAttribute('width'), h = orig.getAttribute('height');
        if (!orig.hasAttribute('viewBox') && w && h) {
          orig.setAttribute('viewBox', `0 0 ${w} ${h}`);
        }
        orig.removeAttribute('width');
        orig.removeAttribute('height');
        const svgEl = document.importNode(orig, true);
        svgEl.classList.add('thh-logo');
        wrapper.prepend(svgEl);
      }).catch(console.error);
    }

    // Title
    const titleEl = document.createElement('h2');
    titleEl.className = 'ytstudiotools-label';
    titleEl.textContent = 'YT StudioTools';
    wrapper.append(titleEl);

    // Status
    const status = document.createElement('span');
    status.className = 'ytstudiotools-status';
    status.textContent = 'Engaged';
    wrapper.append(status);

    // Toggle switch
    const switchContainer = document.createElement('div');
    switchContainer.className = 'toggle-switch';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id   = 'ytstudiotools-switch';
    checkbox.checked = isEnabled();
    switchContainer.append(checkbox);
    const label = document.createElement('label');
    label.className = 'toggle-label';
    label.htmlFor   = 'ytstudiotools-switch';
    switchContainer.append(label);

    checkbox.addEventListener('change', () => {
      setEnabled(checkbox.checked);
      updateCard(lastResult, true);
    });
    wrapper.append(switchContainer);

    // Click on wrapper toggles too
    wrapper.addEventListener('click', e => {
      if (e.target !== checkbox && e.target !== label) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // Insert before the "Advanced" button or at end
    const advancedEl = host.querySelector('ytcp-ve');
    if (advancedEl) host.insertBefore(wrapper, advancedEl);
    else           host.appendChild(wrapper);
  }

  // ── Dropdown/listener helpers ───────────────────────────────────────────
  function attachListeners() {
    const dd = document.querySelector('.yta-latest-activity-card .dropdown-trigger-text');
    if (dd && !dd.__obs) {
      const obs = new MutationObserver(() => updateCard(lastResult, true));
      obs.observe(dd, { childList: true, subtree: true, characterData: true });
      dd.__obs = obs;
    }
    const sel = document.querySelector('.yta-latest-activity-card ytcp-select');
    if (sel && !sel.__click) {
      sel.addEventListener('click', () => setTimeout(() => updateCard(lastResult, true), 100));
      sel.__click = true;
    }
    const lb = document.querySelector('tp-yt-paper-listbox');
    if (lb && !lb.__select) {
      lb.addEventListener('iron-select', () => updateCard(lastResult, true));
      lb.__select = true;
    }
  }

  function injectSecondDropdownText(text) {
    const container = document.querySelector('#mini-card-header .left-container.style-scope.ytcp-dropdown-trigger');
    if (!container) return false;
    const orig = container.querySelector('span.dropdown-trigger-text.style-scope.ytcp-text-dropdown-trigger');
    if (!orig) return false;
    orig.style.opacity = '0';
    let dup = container.querySelector('span.dropdown-trigger-text.ytcp-text-dropdown-trigger:not(.style-scope)');
    if (!dup) {
      dup = document.createElement('span');
      dup.className = 'dropdown-trigger-text ytcp-text-dropdown-trigger';
      dup.style.marginTop = '-30px';
      dup.style.userSelect = 'none';
      orig.insertAdjacentElement('afterend', dup);
    }
    dup.textContent = text;
    return true;
  }

  // ── Update the video‑metric card ─────────────────────────────────────────
  let lastMetricDescription = '';
  function updateCard(result, force = false) {
    if (!isVideoPage || !hasRealData) return;

    lastResult = result;
    insertToggle();
    attachListeners();

    const card      = document.querySelector('.yta-latest-activity-card');
    const metricEl  = card?.querySelector('.metric-value');
    const ddText    = card?.querySelector('.dropdown-trigger-text')?.textContent || '';

    const subtitle = card?.querySelector('.card-subtitle');
    if (subtitle && subtitle.textContent.trim().toLowerCase().includes('subscriber')) {
      console.log('[ytstudiotools] Skipping Subscribers card.');
      return; // STOP — never touch subscriber card
    }

    if (!metricEl) return;
    if (metricEl?.id === 'ytstudiotools_sub_value') return;

    const using60  = ddText.includes('60');
    const on       = isEnabled();
    let   val, desc;

    const chType = getChannelType();
    let prefix;
    if      (chType === 'All longform videos') prefix = 'Views';
    else if (chType === 'All shorts')          prefix = 'Engaged views';
    else                                       prefix = 'Real views';

    if (on && result.gained60 != null && result.gained48 != null) {
      if (using60) {
        val = result.gained60;
        injectSecondDropdownText(`${prefix} · Last 60 minutes`);
        desc = 'engaged 60m';
      } else {
        val = result.gained48;
        injectSecondDropdownText(`${prefix} · Last 48 hours`);
        desc = 'engaged 48h';
      }
    } else {
      if (using60) {
        val = result.totalLast60Minutes || 0;
        injectSecondDropdownText('Views · Last 60 minutes');
        desc = on ? 'YT 60m (on)' : 'YT 60m (off)';
      } else {
        val = result.totalLast48Hours || 0;
        injectSecondDropdownText('Views · Last 48 hours');
        desc = on ? 'YT 48h (on)' : 'YT 48h (off)';
      }
    }

    if (val === 0 && lastDisplay != null) return;
    if (desc !== lastMetricDescription) {
      console.log(`ytstudiotools: ${desc}`);
      lastMetricDescription = desc;
    }

    lastDisplay = val;
    metricEl.textContent = val.toLocaleString();
  }

  // ── Custom events listeners ──────────────────────────────────────────────
  window.addEventListener('ytstudiotoolsRealtimeData', e => {
    if (!isVideoPage) return;
    hasRealData = true;
    updateCard(e.detail, false);
  });

  window.addEventListener('ytstudiotoolsChannelData', () => {
    insertToggle();
  });

  // ── Immediate injection ─────────────────────────────────────────────────
  // Poll every 100ms until the analytics panel is mounted, then inject.
  (function pollForContainer() {
    if (document.querySelector('.advanced-analytics-container')) {
      insertToggle();
    } else {
      setTimeout(pollForContainer, 100);
    }
  })();

})();
