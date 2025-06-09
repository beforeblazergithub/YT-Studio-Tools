// uiChannel.js
(function(){
  const STORAGE_KEY = 'ytstudiotoolsEnabled';

  const m = window.location.href.match(
    /\/(?:channel|artist)\/([^/]+)\//
  );
  const channelID = m ? m[1] : "";

  // ─── build per‑channel storage keys ───────────────
  const rawKey48 = channelID ? `ytstudiotools_raw_48_${channelID}` : 'ytstudiotools_raw_48';
  const rawKey60 = channelID ? `ytstudiotools_raw_60_${channelID}` : 'ytstudiotools_raw_60';
  const engKey48 = channelID ? `ytstudiotools_eng_48_${channelID}` : 'ytstudiotools_eng_48';
  const engKey60 = channelID ? `ytstudiotools_eng_60_${channelID}` : 'ytstudiotools_eng_60';

  // ─── init from localStorage ───────────────────────
  let rawData     = { '48': 0, '60': 0 }, rawLoaded     = false;
  let engagedData = { '48': 0, '60': 0 }, engagedLoaded = false;

  // Spinner flags so we only show it once per mode
  let rawSpinnerShown     = false;
  let engagedSpinnerShown = false;

  const chType = localStorage.getItem('ytstudiotools_channel_type');
  let prefix;
  if      (chType === 'All longform videos') prefix = 'Views';
  else if (chType === 'All shorts')          prefix = 'Engaged views';
  else                                       prefix = 'Real views';

  // Try initialize from localStorage
  const r48 = localStorage.getItem(rawKey48),
        r60 = localStorage.getItem(rawKey60);
  if (r48 !== null && r60 !== null) {
    rawData['48'] = +r48;
    rawData['60'] = +r60;
    rawLoaded     = true;
  }

  const e48 = localStorage.getItem(engKey48),
        e60 = localStorage.getItem(engKey60);
  if (e48 !== null && e60 !== null) {
    engagedData['48'] = +e48;
    engagedData['60'] = +e60;
    engagedLoaded     = true;
  }

  // Raw external views from inject.js
    // Raw external views from inject.js
  window.addEventListener('ytstudiotoolsRawData', e => {
    // ✅ Skip if it's not real channel data
    if (!e.detail.individualStats || e.detail.individualStats.length <= 1) {
      console.log('[ytstudiotools] Skipping raw update — looks like single video page data');
      return;
    }

    rawData['48'] = e.detail.total48h;
    rawData['60'] = e.detail.lastHour;
    rawLoaded     = true;
    updateChannelMetric();
  });

  // Engaged totals from dynamicRequest.js
  window.addEventListener('ytstudiotoolsChannelData', e => {
    // ✅ Skip if it's not real channel data
    if (!e.detail.individualStats || e.detail.individualStats.length <= 1) {
      console.log('[ytstudiotools] Skipping engaged update — looks like single video page data');
      return;
    }

    engagedData['48'] = e.detail.totalGained48 || 0;
    engagedData['60'] = e.detail.totalGained60 || 0;
    engagedLoaded     = true;
    localStorage.setItem(engKey48, engagedData['48']);
    localStorage.setItem(engKey60, engagedData['60']);
    updateChannelMetric();
  });

  function isEnabled() {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  }

  function updateChannelMetric() {
    const subtitleEl = Array.from(
      document.querySelectorAll('.yta-latest-activity-card .card-subtitle')
    ).find(el => {
      const txt = el.textContent.trim().toLowerCase();
      return (/last\s+\d+/.test(txt) && !txt.includes('subscriber'));
    });
  
    if (!subtitleEl) {
      // 🛡️ No matching subtitle found, stop early
      return;
    }
  
    const metricContainer = subtitleEl.closest('.metric-container');
    if (!metricContainer) return;
    
    const valueEl = metricContainer.querySelector('.metric-value');
    if (!valueEl) return;
    if (valueEl?.id === 'ytstudiotools_sub_value') return; // 🚫 don't touch subscriber

    const is60   = subtitleEl.textContent.includes('60');
    const period = is60 ? '60' : '48';

    // Raw mode spinner
    if (!isEnabled()) {
      if (!rawLoaded && !rawSpinnerShown) {
        showSpinner(valueEl);
        subtitleEl.textContent = is60
          ? 'Views · Last 60 minutes'
          : 'Views · Last 48 hours';
        rawSpinnerShown = true;
      }
      if (rawLoaded) {
        rawSpinnerShown = false;
        renderValue(valueEl, subtitleEl, rawData[period], is60, false);
      }
      return;
    }

    // Engaged mode spinner
    if (isEnabled()) {
      if (!engagedLoaded && !engagedSpinnerShown) {
        showSpinner(valueEl);
        subtitleEl.textContent = is60
          ? `${prefix} · Last 60 minutes`
          : `${prefix} · Last 48 hours`;
        engagedSpinnerShown = true;
      }
      if (engagedLoaded) {
        engagedSpinnerShown = false;
        renderValue(valueEl, subtitleEl, engagedData[period], is60, true);
      }
      return;
    }
  }

  function renderValue(valueEl, subtitleEl, val, is60, engaged) {
    // get saved channel-type prefix
    const chType = localStorage.getItem('ytstudiotools_channel_type') || 'Mixed';
    const prefix = chType === 'All longform videos'
      ? 'Engaged views'
      : chType === 'All shorts'
        ? 'Engaged views'
        : 'Real views';

    // set the number
    valueEl.textContent = val.toLocaleString();

    // always label "<prefix> · Last XX"
    subtitleEl.textContent = is60
    ? (engaged
        ? `${prefix} · Last 60 minutes`
        : 'Views · Last 60 minutes')
    : (engaged
        ? `${prefix} · Last 48 hours`
        : 'Views · Last 48 hours');
  }


  function showSpinner(el) {
    el.textContent = '';
    const s = document.createElement('div');
    s.className = 'ns-spinner';
    el.appendChild(s);
  }

  // Poll in case card re-renders
  setInterval(updateChannelMetric, 100);
  updateChannelMetric();

  
// —— Patch: swap Top Content counts with our console data when Engaged is on ——

(function patchTopContent() {
  const STORAGE_KEY = 'ytstudiotoolsEnabled';

  function replaceValues(detail) {
    if (localStorage.getItem(STORAGE_KEY) !== 'true') {
      console.log('[ytstudiotools] Engaged mode is OFF — skipping Top Content patch');
      return;
    }
    console.log('[ytstudiotools] Engaged mode is ON — patching Top Content rows');

    // pick gained48 for ENGAGED_VIEWS, otherwise totalLast48Hours
    const stats = detail.individualStats || [];
    const lookup = new Map(
      stats.map(s => [
        s.videoId,
        s.gained48 != null ? s.gained48 : s.totalLast48Hours
      ])
    );

    document.querySelectorAll('.yta-latest-activity-card .row').forEach(row => {
      const link = row.querySelector('a[href*="/video/"]');
      if (!link) return;
      const m = link.href.match(/\/video\/([^/]+)/);
      if (!m) return;
      const videoId = m[1];

      const newVal = lookup.get(videoId);
      const valueEl = row.querySelector('.value');
      if (newVal != null && valueEl) {
        console.log(
          `[ytstudiotools] swapping video ${videoId}:`,
          'old→', valueEl.textContent.trim(),
          'new→', newVal
        );
        valueEl.textContent = newVal.toLocaleString();
      } else {
        console.log(`[ytstudiotools] no console data for video ${videoId}, skipping`);
      }
    });
  }

  // run on new channel data
  window.addEventListener('ytstudiotoolsChannelData', e => {
    // stash for toggles
    window._lastChannelData = e.detail;
    replaceValues(e.detail);
      updateChannelMetric();
      // **ADD** this line to patch Top Content whenever new data arrives:
      patchTopContent(e.detail);
  });

  // ─── Patch Top Content rows when Engaged = ON ─────────────────────────
function patchTopContent(aggregator) {
  if (localStorage.getItem('ytstudiotoolsEnabled') !== 'true') return;
  const lookup = new Map(
    aggregator.individualStats.map(s => [
      s.videoId,
      s.gained48 != null ? s.gained48 : s.totalLast48Hours
    ])
  );
  document.querySelectorAll('.yta-latest-activity-card .row').forEach(row => {
    const a = row.querySelector('a[href*="/video/"]');
    if (!a) return;
    const vid = (a.href.match(/\/video\/([^/]+)/) || [])[1];
    const vEl = row.querySelector('.value');
    const newVal = lookup.get(vid);
    if (newVal != null && vEl) {
      vEl.textContent = newVal.toLocaleString();
    }
  });
}

// ─── Restore YouTube’s own counts when Engaged = OFF ────────────────
(function restoreOriginalTopContent() {
  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('ytstudiotools-switch');
    if (!toggle) return;
    toggle.addEventListener('change', () => {
      if (toggle.checked) return;  // only run when turned OFF
      const orig = window._ytstudiotools_originalTopContent;
      if (!orig || orig.channelId !== (
        location.href.match(/\/(?:channel|artist)\/([^/]+)\//)||[])[1]
      ) return;
      const lookup = new Map(orig.ids.map((id,i) => [ id, orig.views[i] ]));
      document.querySelectorAll('.yta-latest-activity-card .row').forEach(row => {
        const a = row.querySelector('a[href*="/video/"]');
        if (!a) return;
        const vid = (a.href.match(/\/video\/([^/]+)/) || [])[1];
        const vEl = row.querySelector('.value');
        const original = lookup.get(vid);
        if (original != null && vEl) {
          vEl.textContent = original.toLocaleString();
        }
      });
    });
  });
})();


  // re-run when the user flips Engaged
  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('ytstudiotools-switch');
    if (!toggle) return;
    toggle.addEventListener('change', () => {
      if (toggle.checked) {
        console.log('[ytstudiotools] Engaged toggled ON — re-patching Top Content');
        replaceValues(window._lastChannelData || { individualStats: [] });
      } else {
        console.log('[ytstudiotools] Engaged toggled OFF — reloading to restore YouTube defaults');
      }
    });
  });
})();


})();