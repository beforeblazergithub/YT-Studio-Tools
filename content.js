// content.js
(function () {
  function parseAnalyticsContext(url) {
    const m = url.match(
      /\/(video|channel|artist)\/([^/]+)\/analytics\/tab-([^\/?#]+)(?:\/|\?|#|$)/
    );
    if (!m) return null;
    return { type: m[1], id: m[2], tab: m[3] };
  }
  
  // ─── track last URL & its analytics context ────────────────────────────
  let lastHref     = location.href;
  let prevContext  = parseAnalyticsContext(lastHref);
  
  // ─── super‑fast polling (1 ms) for SPA URL changes ──────────────────────
 // ─── Cleanup before reinjecting ─────────────────────────────────────
// ─── Cleanup & SPA-nav watcher (handles BOTH channel→video and video→channel) ────────────────────
function cleanupInjectedUI() {
  // — your existing removals —
  document.querySelector('#ytstudiotools-wrapper')?.remove();
  document.querySelectorAll('.thh-modal-overlay').forEach(el => el.remove());
  document.querySelectorAll('link[href*="ui.css"]').forEach(el => el.remove());
  document.querySelector('meta[name="ytstudiotools-logo-url"]')?.remove();

  // — clear video-only payloads so the next video starts fresh —
  sessionStorage.removeItem('interceptedPayload');
  sessionStorage.removeItem('interceptedHeaders');
  document.querySelectorAll('script').forEach(s => {
    const src = s.src || '';
    if (/dynamicRequest\.js$|ui\.js$|uiChannel\.js$|uiMusic\.js$|chartHover\.js$/.test(src)) {
      s.remove();
    }
  });
  if (window.analyticsPayloadCache) window.analyticsPayloadCache = {};

  // — ***NEW: Fully reset Subscriber metric if wrong*** —
  const containers = document.querySelectorAll('.yta-latest-activity-card .metric-container');
  containers.forEach(container => {
    const subtitle = container.querySelector('.card-subtitle');
    const metric   = container.querySelector('.metric-value');
    if (subtitle && metric && subtitle.textContent.trim().toLowerCase().includes('subscriber')) {
      // Force reload original YouTube value if somehow wrong
      const span = metric.querySelector('span');
      if (span) {
        metric.textContent = span.textContent;
      }
    }
  });
}

(function patchMetricGlitch() {
  let lastGoodMetricValue = '';

  setInterval(() => {
    const metric = document.querySelector('.metric-value.style-scope.yta-latest-activity-card');

    if (metric) {
      const val = metric.textContent.trim();

      if (val && !isNaN(parseInt(val.replace(/,/g, '')))) {
        // If it's a real number (e.g., 26,801), save it
        lastGoodMetricValue = val;
      } else if (lastGoodMetricValue) {
        // If it's empty or garbage, restore last good one
        metric.textContent = lastGoodMetricValue;
      }
    }
  }, 10);
})();

;(function watchAnalyticsNav() {
  let lastHref = location.href;
  setInterval(() => {
    const href = location.href;
    if (href === lastHref) return;
    lastHref = href;

    const ctx = parseAnalyticsContext(href);
    if (ctx?.tab === 'overview') {
      console.log('[Content] SPA nav → cleaning up + reinjecting analytics');
      cleanupInjectedUI();
      handleAnalyticsPage();
    }
  }, 5);
})();


  const logoutLogoUrl = chrome.runtime.getURL('images/logo.svg');

  function injectScript(file) {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL(file);
    (document.head || document.documentElement).appendChild(s);
    s.onload = () => s.remove();
  }

  function getChannelID() {
    const m = location.href.match(/\/(?:channel|artist)\/([^/]+)\//);
    return m ? m[1] : "";
  }
  const channelID = getChannelID();

  // per‑channel storage keys
  const rawKey48 = channelID
    ? `ytstudiotools_raw_48_${channelID}`
    : "ytstudiotools_raw_48";
  const rawKey60 = channelID
    ? `ytstudiotools_raw_60_${channelID}`
    : "ytstudiotools_raw_60";
  const engKey48 = channelID
    ? `ytstudiotools_eng_48_${channelID}`
    : "ytstudiotools_eng_48";
  const engKey60 = channelID
    ? `ytstudiotools_eng_60_${channelID}`
    : "ytstudiotools_eng_60";

    const setupModalHTML = `
    <div class="thh-modal-overlay" id="setupModal">
      <div class="thh-modal-content thh-modal-smaller">
        <!-- Header -->
        <div class="thh-modal-header">
          <h2>Setting up YT Studio Tools for your channel…</h2>
        </div>

        <!-- Subtitle -->
        <p class="thh-modal-subtitle">Almost there—this should only take a few seconds.</p>

        <!-- Body -->
        <div class="thh-modal-body">
          <div class="thh-alert-box">
            <span class="thh-alert-text">
              <p>Typical setup completes in 3–10&nbsp;seconds.</p>
              <div class="ns-spinner"></div>
            </span>
          </div>
        </div>

        <!-- Footer -->
        <div class="thh-modal-footer">
          <img src="${logoutLogoUrl}" class="setup-logo" alt="Logo" />
          <button class="thh-btn thh-btn-primary" id="setupModalOk">Got it!</button>
        </div>
      </div>
    </div>`;
  document.documentElement.insertAdjacentHTML('beforeend', setupModalHTML);

  const setupOverlay  = document.getElementById('setupModal');
  const setupOkBtn    = document.getElementById('setupModalOk');

  function showSetupModal() { setupOverlay.style.display = 'flex'; }
  function hideSetupModal() { setupOverlay.style.display = 'none'; }

  setupOkBtn.addEventListener(   'click', hideSetupModal);
  setupOverlay.addEventListener('click', e => {
    if (e.target === setupOverlay) hideSetupModal();
  });

  const storage = location.href.includes('/video/') ? sessionStorage : localStorage;
  const storagePoll = setInterval(() => {
    if (
      storage.getItem(rawKey48) &&
      storage.getItem(rawKey60) &&
      storage.getItem(engKey48) &&
      storage.getItem(engKey60)
    ) {
      hideSetupModal();
      clearInterval(storagePoll);
    }
  }, 100);

  /** Safe wrapper around chrome.runtime.sendMessage. */
  function sendMessageSafe(message, callback = () => {}) {
    // If the extension world has already been torn down, bail out early.
    if (!chrome.runtime?.id) {
      console.log('[Content] chrome.runtime.id missing – context is gone; skipping message');
      return;
    }

    try {
      chrome.runtime.sendMessage(message, callback);
    } catch (err) {
      if (String(err).includes('Extension context invalidated')) {
        console.log('[Content] Extension context invalidated – message skipped');
        callback({ error: 'Extension context invalidated' });
      } else {
        throw err; // other errors are still surfaced
      }
    }
  }

  function isVideoAnalyticsURL(url) {
    return url.includes('/video/') && url.includes('/analytics/');
  }
  
  function isChannelAnalyticsURL(url) {
    return /\/(?:channel|artist)\/[^/]+\/analytics\/tab-overview\/period-default(?:[\/?]|$)/.test(
      url
    );
  }

  function handleAnalyticsPage() {
    console.log('[Content] Analytics page – injecting dynamicRequest.js');
    const storage = location.href.includes('/video/') ? sessionStorage : localStorage;
  storage.removeItem('interceptedPayload');
  storage.removeItem('interceptedHeaders');
  
    // 1) network interceptor + logic
    injectScript('dynamicRequest.js');
  
    // 2) load the CSS
    const cssLink = document.createElement('link');
    cssLink.rel  = 'stylesheet';
    cssLink.href = chrome.runtime.getURL('ui.css');
    (document.head || document.documentElement).appendChild(cssLink);
  
    // 3) mark the logo URL via a <meta>
    const meta = document.createElement('meta');
    meta.name    = 'ytstudiotools-logo-url';
    meta.content = chrome.runtime.getURL('images/logo.svg');
    (document.head || document.documentElement).appendChild(meta);

    // 3) stash the logo URL in localStorage for ui.js to pick up
    localStorage.setItem(
        'ytstudiotools_logo_url',
        chrome.runtime.getURL('images/logo.svg')
    );
  
    // 4) finally, inject your UI code
    injectScript('ui.js');

    if (isChannelAnalyticsURL(location.href)) {
      injectScript('uiChannel.js');
      injectScript('uiMusic.js');
      injectScript('chartHover.js');
      if (
        localStorage.getItem(rawKey48) &&
        localStorage.getItem(rawKey60) &&
        localStorage.getItem(engKey48) &&
        localStorage.getItem(engKey60)
      ) {
        hideSetupModal();
      } else {
        showSetupModal();
      }
    }
  }  

  /* ─── Bootstrapping ────────────────────────────────────────────────────── */

  injectScript('inject.js');

  const extId = chrome.runtime.id;
  localStorage.setItem('extension_ID_ytstudiotools', extId);
  document.dispatchEvent(new CustomEvent('receiveExtensionId', { detail: extId }));

  if ( isVideoAnalyticsURL(location.href) || isChannelAnalyticsURL(location.href) ) {
    handleAnalyticsPage();
  }

  /* ─── Bridge CLASSIFY_VIDEO_IDS → background service‑worker ───────────── */

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.type !== 'CLASSIFY_VIDEO_IDS') return;

    sendMessageSafe(
      { type: 'CLASSIFY_VIDEO_IDS', videoIds: e.data.videoIds },
      (resp = {}) => {
        // Always echo something back so dynamicRequest.js continues smoothly.
        window.postMessage(
          {
            type: 'CLASSIFY_VIDEO_IDS_RESULT',
            videos: Array.isArray(resp.videos) ? resp.videos : [],
          },
          '*'
        );
      }
    );
  });

  /* ─── Logout‑Confirmation Modal ───────────────────────────────────── */

  // 1) Get logo URL for modal

  // 2) Inject logout modal HTML
  const logoutModalHTML = `
    <div class="thh-modal-overlay" id="logoutModal">
      <div class="thh-modal-content thh-modal-smaller">
        <div class="thh-modal-header">
          <h2>Confirm sign out</h2>
        </div>
        <p class="thh-modal-subtitle">Are you sure you want to sign out?</p>
        <div class="thh-modal-body">
          <div class="thh-alert-box">
            <span class="thh-alert-text">
              You can sign back into YouTube anytime using your Google account(s).
            </span>
          </div>
        </div>
        <div class="thh-modal-footer">
          <img src="${logoutLogoUrl}" class="thh-logo-footer" alt="Logo" />
          <div class="thh-footer-buttons">
            <button class="thh-btn thh-btn-gray" id="logoutCancelBtn">Cancel</button>
            <button class="thh-btn thh-btn-primary" id="logoutConfirmBtn">Sign out</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.documentElement.insertAdjacentHTML('beforeend', logoutModalHTML);

  // Cache modal controls
  const overlay    = document.getElementById('logoutModal');
  const btnCancel  = document.getElementById('logoutCancelBtn');
  const btnConfirm = document.getElementById('logoutConfirmBtn');
  let pendingURL   = null;

  function showLogoutModal(url) {
    pendingURL = url;
    overlay.style.display = 'flex';
  }
  function hideLogoutModal() {
    overlay.style.display = 'none';
    pendingURL = null;
  }
  btnCancel.addEventListener('click', hideLogoutModal);
  btnConfirm.addEventListener('click', () => {
    if (pendingURL) window.location.href = pendingURL;
  });

  overlay.addEventListener('click', e => {
    e.stopPropagation();
    if (e.target === overlay) hideLogoutModal();
  });
  overlay.addEventListener('wheel', e => e.preventDefault(), { passive: false });
  overlay.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

  // Bind logout links
  const LOGOUT_BOUND = 'data-logout-bound';
  function bindLogoutLinks() {
    document
      .querySelectorAll('a[href*="/logout"]:not([' + LOGOUT_BOUND + '])')
      .forEach(a => {
        a.setAttribute(LOGOUT_BOUND, 'true');
        a.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          showLogoutModal(a.href);
        }, true);
      });
  }
  setInterval(bindLogoutLinks, 100);

  function repShortMoney() {
    if (
      /^https:\/\/studio\.youtube\.com\/channel\/[^/]+\/monetization\/overview(?:[\/?]|$)/.test(
        location.href
      )
    ) {  
      function replaceShortsViewsText() {
        // only run once body exists
        const root = document.body;
        if (!root) return;
        const walker = document.createTreeWalker(
          root,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );
        let node;
        while (node = walker.nextNode()) {
          if (node.nodeValue.includes('valid public Shorts views')) {
            node.nodeValue = node.nodeValue.replace(
              /valid public Shorts views/g,
              'valid public Shorts engaged views'
            );
          }
        }
      }

      replaceShortsViewsText();
        // then periodically re‑apply in case SPA updates re‑render the text
      setInterval(replaceShortsViewsText, 100);
    
      window.addEventListener('load', () => {
        // first pass after full load
        replaceShortsViewsText();
        // then periodically re‑apply in case SPA updates re‑render the text
        setInterval(replaceShortsViewsText, 100);
      });
    }  
  }
  setInterval(repShortMoney, 100);

  /*(function addDiscordButton() {
    // only run on YouTube Studio
    if (!location.href.startsWith('https://studio.youtube.com/')) return;
  
    const containerSelector  = '.right-section-content .icons-section';
    const helpWidgetSelector = '#help-widget';
  
    const tryInsert = () => {
      const iconsSection = document.querySelector(containerSelector);
      const helpWidget   = iconsSection?.querySelector(helpWidgetSelector);
      if (!iconsSection || !helpWidget) return false;
  
      // create a plain <button>, not <ytcp-button>
      const btn = document.createElement('button');
      btn.id = 'join-discord-button';
      btn.classList.add('ns-discord-button');
      btn.setAttribute('aria-label', 'Join the Discord');
      btn.type = 'button';
  
      // FontAwesome icon
      const icon = document.createElement('i');
      icon.classList.add('fa-brands', 'fa-discord');
      btn.appendChild(icon);
  
      // label
      btn.appendChild(document.createTextNode('Join the Discord'));
  
      // click opens your Discord link
      btn.addEventListener('click', () => {
        window.open('https://google.com', '_blank');
      });
  
      // insert before the Help icon
      iconsSection.insertBefore(btn, helpWidget);
      return true;
    };
  
    // poll until ready
    const interval = setInterval(() => {
      if (tryInsert()) clearInterval(interval);
    }, 100);
  })();*/

  // content.js — Add this patch at the bottom
  (function patchSubscriberEvery10ms() {
    const interval = setInterval(() => {
      const containers = document.querySelectorAll('.metric-container.style-scope.yta-latest-activity-card');
      for (const container of containers) {
        const subtitle = container.querySelector('.card-subtitle');
        const valueEl  = container.querySelector('.metric-value');

        if (!subtitle || !valueEl) continue;

        const subText = subtitle.textContent.trim().toLowerCase();
        if (subText.includes('subscriber') && valueEl.id !== 'ytstudiotools_sub_value') {
          valueEl.id = 'ytstudiotools_sub_value';
          console.log('[ytstudiotools] Patched subscriber value with id=ytstudiotools_sub_value');
        }
      }
    }, 10);
  })();
  
    // ─── Scale bars down to 70% when Engaged is ON, restore when OFF ────────
  (function scaleBarsOnEngaged() {
    function applyScaling() {
      // only run on any analytics page
      if (!parseAnalyticsContext(location.href)) return;

      const engaged = localStorage.getItem('ytstudiotoolsEnabled') === 'true';
      document.querySelectorAll('#chart-container .bar-group path.bar').forEach(bar => {
        if (engaged) {
          bar.style.transformOrigin = '0px 36px';
          bar.style.transform        = 'scaleY(0.70)';
        } else {
          // clear our overrides so bars go back to normal
          bar.style.transformOrigin = '';
          bar.style.transform       = '';
        }
      });
    }

    // poll in case SPA re-renders
    setInterval(applyScaling, 100);
  })();

  document.addEventListener('DOMContentLoaded', () => {
    const fa = document.createElement('link');
    fa.rel  = 'stylesheet';
    fa.href = 'https://site-assets.fontawesome.com/releases/v6.7.2/css/all.css';
    (document.head || document.documentElement).prepend(fa);
  });

})();

(() => {

  if (location.pathname.includes('/analytics/')) {
    console.log('[LayoutEditor] skipping analytics page');
    return;
  }
  const STORAGE_KEY = `layout_${location.pathname.split('/')[2]}`;
  const HIDDEN_KEY = STORAGE_KEY + '_hidden';
  const EXTRA_KEY   = STORAGE_KEY + '_extraCol';
  let hiddenIds = [];

  console.log('[LayoutEditor] STORAGE_KEY =', STORAGE_KEY);

  function clearLayout() {
    chrome.storage.sync.remove([STORAGE_KEY, HIDDEN_KEY], () => {
      console.log('[LayoutEditor] layout cleared');
      hiddenIds = [];
      restoreLayout();
      window.location.reload();
    });
  }

  function isChannelHome() {
    return /^\/channel\/[^\/]+\/?$/.test(location.pathname);
  }

  let prevHref = location.href;
  setInterval(() => {
    if (location.href !== prevHref) {
      console.log('[LayoutEditor] URL:', prevHref, '→', location.href);
      prevHref = location.href;
      waitForReady();
    }
  }, 100);

  function waitForReady() {
  if (!isChannelHome()) {
    console.log('[LayoutEditor] skipping (not channel home)', location.pathname);
    return;
  }

  const container = document.querySelector('.cards.left-align-columns');
  const hasCards  = container && container.querySelectorAll('ytcd-card[test-id]').length > 0;
  const hasBar    = !!document.querySelector('#dashboard-actions');

  console.log(
    '[LayoutEditor] ready check →',
    'container?', !!container,
    'cards?',   hasCards,
    'bar?',     hasBar
  );

  if (container && hasCards && hasBar) {
    console.log('[LayoutEditor] all ready → init()');
    if (localStorage.getItem(EXTRA_KEY) === 'true') {
      ensureExtraColumn();
    }
    init();
  } else {
    setTimeout(waitForReady, 100);
  }
}
  waitForReady();

  function ensureExtraColumn() {
    const container = document.querySelector('.cards.left-align-columns');
    if (!container) return;
    if (container.querySelector('ytcd-card-column.extra-column')) return;

    const extra = document.createElement('ytcd-card-column');
    extra.classList.add(
      'column',
      'style-scope',
      'ytcd-channel-dashboard',
      'extra-column'
    );
    container.appendChild(extra);

    localStorage.setItem(EXTRA_KEY, 'true');
    console.log('[LayoutEditor] ↳ extra column injected');
  }


  function saveLayout(cols) {
    console.log('[LayoutEditor] saveLayout', cols);
    return chrome.storage.sync.set({ [STORAGE_KEY]: cols });
  }

  function loadLayout() {
    return chrome.storage.sync.get(STORAGE_KEY)
      .then(d => d[STORAGE_KEY] || [])
      .catch(err => {
        console.error('[LayoutEditor] loadLayout error', err);
        return [];
      });
  }


  let originalMap = {}, originalRects = {};
  function snapshotOriginal() {
    originalMap = {}; originalRects = {};
    document.querySelectorAll('ytcd-card[test-id]').forEach(c => {
      const id  = c.getAttribute('test-id');
      const col = c.closest('ytcd-card-column');
      originalMap[id] = col
        ? Array.from(col.parentNode.children).indexOf(col)
        : Array.from(c.parentNode.children).indexOf(c);
      const r = c.getBoundingClientRect();
      originalRects[id] = { top: r.top, left: r.left };
    });
    console.log('[LayoutEditor] snapshotOriginal cards=', Object.keys(originalMap).length);
  }

  function snapshotCols() {
    const container = document.querySelector('.cards.left-align-columns');
    if (!container) return [];
    return Array.from(container.children).map(col => {
      if (col.matches('ytcd-card-column')) {
        return Array.from(col.querySelectorAll('ytcd-card'))
          .filter(c => !c.classList.contains('studio-deleted'))
          .map(c => c.getAttribute('test-id'));
      } else if (col.matches('ytcd-card[test-id]') &&
                 !col.classList.contains('studio-deleted')) {
        return [col.getAttribute('test-id')];
      }
      return [];
    });
  }

  async function persistLayout() {
    console.log('[LayoutEditor] persistLayout');
    await saveLayout(snapshotCols());  
    await chrome.storage.sync.set({ [HIDDEN_KEY]: hiddenIds });
  }

  async function restoreLayout() {
    ensureExtraColumn();
    console.log('[LayoutEditor] restoreLayout');

    document.querySelectorAll('ytcd-card[test-id]').forEach(card => {
           card.style.display = '';
           card.classList.remove('studio-deleted');
     });

    wrapCssTiles();
  
    const d = await chrome.storage.sync.get(HIDDEN_KEY);
    hiddenIds = d[HIDDEN_KEY] || [];
  
    const savedCols = await loadLayout();
    const container = document.querySelector('.cards.left-align-columns');
    if (!container) return console.log('[LayoutEditor] no container');
  
    snapshotOriginal();
  
    const cols = Array.from(container.children);
    cols.forEach((col, ci) => {
      (savedCols[ci] || []).forEach(id => {
        const card = document.querySelector(`ytcd-card[test-id="${id}"]`);
        if (!card) return console.log('[LayoutEditor] missing', id);
        if (col.matches('ytcd-card-column')) col.appendChild(card);
        else container.insertBefore(card, col.nextSibling);
      });
    });
  
    const used = new Set(savedCols.flat());
    container.querySelectorAll('ytcd-card[test-id]').forEach(card => {
      const id = card.getAttribute('test-id');
      if (used.has(id)) return;
      const origIdx = originalMap[id] ?? (cols.length - 1);
      const target  = cols[origIdx] || cols[cols.length - 1];
      if (target.matches('ytcd-card-column')) target.appendChild(card);
      else container.insertBefore(card, target.nextSibling);
    });
  
    Object.entries(originalRects).forEach(([id, prev]) => {
      const card = document.querySelector(`ytcd-card[test-id="${id}"]`);
      if (!card) return;
      const nr = card.getBoundingClientRect();
      const dx = prev.left - nr.left, dy = prev.top - nr.top;
      if (!dx && !dy) return;
      card.style.transform  = `translate(${dx}px, ${dy}px)`;
      card.style.transition = 'transform 300ms ease';
      requestAnimationFrame(() => card.style.transform = '');
      card.addEventListener('transitionend', function h() {
        card.style.transition = '';
        card.removeEventListener('transitionend', h);
      });
    });
  
    hiddenIds.forEach(id => {
      const card = document.querySelector(`ytcd-card[test-id="${id}"]`);
      if (card) card.style.display = 'none';
    });
  }
  

  function animateReorder(mutate) {
    const container = document.querySelector('.cards.left-align-columns');
    if (!container) return;
    const cards  = Array.from(container.querySelectorAll('ytcd-card'));
    const before = cards.map(c => c.getBoundingClientRect());
    mutate();
    cards.forEach((card, i) => {
      const after = card.getBoundingClientRect();
      const dx = before[i].left - after.left, dy = before[i].top - after.top;
      if (dx || dy) {
        card.animate([
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: 'translate(0,0)' }
        ], { duration: 200, easing: 'ease-out', fill: 'both' });
      }
    });
  }

  let editMode = false;
  function ensureFontAwesome() {
    const href = 'https://site-assets.fontawesome.com/releases/v6.7.2/css/all.css';
    if (!document.head.querySelector(`link[href="${href}"]`)) {
      const fa = document.createElement('link');
      fa.rel  = 'stylesheet';
      fa.href = href;
      document.head.appendChild(fa);
    }
  }

  function injectToggle() {
    const bar = document.querySelector('#dashboard-actions');
    if (!bar) {
      console.log('[LayoutEditor] no #dashboard-actions');
      return;
    }
    if (bar.querySelector('#edit-layout-btn')) return;

    ensureFontAwesome();

    const btn = document.createElement('button');
    btn.id = 'edit-layout-btn';
    btn.style.marginLeft = '8px';
    function setBtnIcon(mode) {
      while (btn.firstChild) btn.removeChild(btn.firstChild);
      const icon = document.createElement('i');
      icon.classList.add(
        'fa-light',
        mode === 'edit' ? 'fa-swap' : 'fa-circle-check'
      );
      btn.appendChild(icon);
      btn.appendChild(
        document.createTextNode(mode === 'edit' ? ' Edit layout' : ' Done')
      );
    }

    let editMode = false;
    setBtnIcon('edit');

    btn.addEventListener('click', () => {
      editMode = !editMode;
      setBtnIcon(editMode ? 'done' : 'edit');
      
      btn.classList.toggle('done', editMode);

      toggleEdit(editMode);
      if (!editMode) persistLayout();
    });

    bar.appendChild(btn);

    const popup = document.createElement('div');
    popup.id = 'reset-layout-popup';
    Object.assign(popup.style, {
      position:      'absolute',
      display:       'none',
      zIndex:        '999999'
    });
    popup.innerHTML = `
      <div class="dropdown-wrapper">
        <nav class="dropdown-menu" role="menu" aria-orientation="vertical">
          <button class="menu-item" role="menuitem" tabindex="0">
            <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path fill-rule="evenodd" clip-rule="evenodd"
                d="M6 6.25h12a1 1 0 1 1 0 2H6a1 1 0 1 1 0-2Zm-3 .75A3.25 3.25 0 0 1 6 4.25h12A3.25 3.25 0 0 1 21 7.25 3.25 3.25 0 0 1 18 10.25H6a3.25 3.25 0 0 1-3-3Zm0 6.75a1 1 0 0 1 1-1h9.876a8.714 8.714 0 0 0-1.063 2H4a1 1 0 0 1-1-1Zm10.109 5.75c-.279-.620-.473-1.293-.555-2.001H4a1 1 0 1 1 0-2h9.109c.290.620.484 1.293.565 2.001H4a1 1 0 0 1 0 2Zm3.961 1.856c.603.263 1.248.395 1.934.395A5.948 5.948 0 0 0 20.93 19.75c.603-.263 1.135-.625 1.597-1.087a5.948 5.948 0 0 0 1.258-2.477 1 1 0 1 0-1.938-.392V17.702h-1.790a.998.998 0 0 0-.186 1.990h1.790v1.788c0 .212-.064.382-.192.510a.707.707 0 0 1-1.262 0l-.002-.001Z"/>
            </svg>
            <span>Reset Layout</span>
          </button>
        </nav>
      </div>
    `;


    document.body.appendChild(popup);

    const resetBtn = popup.querySelector('.menu-item');
    resetBtn.addEventListener('click', e => {
    e.stopPropagation();
    chrome.storage.sync.remove([STORAGE_KEY, HIDDEN_KEY], () => {
      console.log('[LayoutEditor] layout cleared');
      popup.style.display = 'none';

      window.top.location.reload();
    });
  });

    btn.addEventListener('mouseenter', () => {
      const r = btn.getBoundingClientRect();
      popup.style.top  = `${window.scrollY + r.bottom}px`;
      popup.style.left = `${window.scrollX + r.left + r.width/2}px`;
      popup.style.transform = 'translateX(-50%)';
      popup.style.display   = 'block';
    });

    btn.addEventListener('mouseleave', () => {
      setTimeout(() => {
        if (!popup.matches(':hover')) popup.style.display = 'none';
      }, 10);
    });
    popup.addEventListener('mouseenter', () => popup.style.display = 'block');
    popup.addEventListener('mouseleave', () => popup.style.display = 'none');

    console.log('[LayoutEditor] button injected with icons!');
  }


  function toggleEdit(on) {
    document.querySelectorAll('ytcd-card[test-id]').forEach(card => {
      const id = card.getAttribute('test-id');
  
      if (on) {
        if (!card.querySelector('.studio-delete-btn')) {
          const btn = document.createElement('button');
          btn.className = 'studio-delete-btn';
          btn.innerHTML = '<i class="fa-solid fa-times"></i>';
          btn.addEventListener('mousedown', e => e.stopPropagation());

          btn.addEventListener('click', e => {
            e.stopPropagation();
            if (!hiddenIds.includes(id)) {
              hiddenIds.push(id);
              card.classList.add('studio-deleted');
              card.style.display = 'none';

              persistLayout();
            }
          });
          card.appendChild(btn);
        }
        card.style.cursor = 'grab';
        card.addEventListener('mousedown', startDrag);
        card.classList.add('editing-card');
  
      } else {
        const db = card.querySelector('.studio-delete-btn');
        if (db) db.remove();
        card.style.cursor = '';
        card.removeEventListener('mousedown', startDrag);
        card.classList.remove('editing-card');
      }
    });
  }
  

  let dragEl, placeholder, offsetX, offsetY;
  function startDrag(e) {
    if (e.button !== 0) return;
    snapshotOriginal();
    const r = e.currentTarget.getBoundingClientRect();
    dragEl = e.currentTarget;
    offsetX = e.clientX - r.left;
    offsetY = e.clientY - r.top;
    placeholder = document.createElement('div');
    placeholder.className = 'card-placeholder';
    placeholder.style.width  = `${r.width}px`;
    placeholder.style.height = `${r.height}px`;
    dragEl.parentNode.insertBefore(placeholder, dragEl.nextSibling);
    Object.assign(dragEl.style, {
      position:      'fixed',
      left:          `${r.left}px`,
      top:           `${r.top}px`,
      width:         `${r.width}px`,
      height:        `${r.height}px`,
      zIndex:        10000,
      pointerEvents: 'none',
    });
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup',   endDrag);
    e.preventDefault();
  }

  function onDrag(e) {
    dragEl.style.left = `${e.clientX - offsetX}px`;
    dragEl.style.top  = `${e.clientY - offsetY}px`;
    const container = document.querySelector('.cards.left-align-columns');
    if (!container) return;
    const cols = Array.from(container.querySelectorAll('ytcd-card-column'));
    const over = cols.find(col => {
      const rc = col.getBoundingClientRect();
      return e.clientX >= rc.left && e.clientX <= rc.right;
    });
    if (!over) return;
    animateReorder(() => {
      if (placeholder.parentNode !== over) over.appendChild(placeholder);
      const siblings = Array.from(over.querySelectorAll('ytcd-card'))
                            .filter(c => c !== dragEl);
      let placed = false;
      for (let s of siblings) {
        const rc = s.getBoundingClientRect();
        if (e.clientY < rc.top + rc.height/2) {
          over.insertBefore(placeholder, s);
          placed = true;
          break;
        }
      }
      if (!placed) over.appendChild(placeholder);
    });
  }

  function endDrag() {
    placeholder.parentNode.insertBefore(dragEl, placeholder);
    dragEl.removeAttribute('style');
    placeholder.remove();
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup',   endDrag);
    persistLayout();
  }

  (function injectMinimalCSS() {
  const parent = document.head || document.documentElement;
  if (!parent) {
    return setTimeout(injectMinimalCSS, 50);
  }

  const style = document.createElement('style');
  style.textContent = `
    ytcd-card { transition: transform 300ms ease !important; }
    .card-placeholder {
      border: 2px dashed #999;
      box-sizing: border-box;
      margin-bottom: 24px;
      border-radius: 16px;
    }
  `;

  parent.appendChild(style);
})();

  function wrapCssTiles() {
    document.querySelectorAll('div.css-pz5p0b.e1saqa0w6').forEach((tile, i) => {
      if (!tile.closest('ytcd-card')) {
        const card = document.createElement('ytcd-card');
        const id = `auto-tile-${i}`;    
        card.setAttribute('test-id', id);
        tile.parentNode.insertBefore(card, tile);
        card.appendChild(tile);

        if (hiddenIds.includes(id)) {
                   card.style.display = 'none';
                   card.classList.add('studio-deleted');
                 }
      }
    });
  }

  function init() {
    ensureExtraColumn();
    console.log('[LayoutEditor] ▶️ init()');
    wrapCssTiles();
    injectToggle();
    restoreLayout();
  }

  setInterval(wrapCssTiles, 100);
})();