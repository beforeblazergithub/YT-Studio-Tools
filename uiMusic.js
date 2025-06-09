// uiMusic.js
(function() {
    const isMusicPage = /\/artist\/[^/]+\/analytics\/tab-overview\/period-default\/total_reach-all/.test(location.href);
    if (!isMusicPage) return;
  
    const STORAGE_KEY = 'ytstudiotoolsEnabled';
    const [, channelID = ''] = location.href.match(/\/artist\/([^/]+)\//) || [];
  
    // per-artist storage keys
    const rawKey48 = channelID ? `ytstudiotools_raw_48_${channelID}` : 'ytstudiotools_raw_48';
    const rawKey60 = channelID ? `ytstudiotools_raw_60_${channelID}` : 'ytstudiotools_raw_60';
    const engKey48 = channelID ? `ytstudiotools_eng_48_${channelID}` : 'ytstudiotools_eng_48';
    const engKey60 = channelID ? `ytstudiotools_eng_60_${channelID}` : 'ytstudiotools_eng_60';
    
    const chType = localStorage.getItem('ytstudiotools_channel_type');
    let prefix;
    if      (chType === 'All longform videos') prefix = 'Views';
    else if (chType === 'All shorts')          prefix = 'Engaged views';
    else                                       prefix = 'Real views';
  
    // data and loading flags
    let rawData         = { '48': 0, '60': 0 };
    let engagedData     = { '48': 0, '60': 0 };
    let rawLoaded       = false;
    let engagedLoaded   = false;
    let rawSpinnerShown     = false;
    let engagedSpinnerShown = false;
  
    function isEnabled() {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    }
  
    function syncData() {
      const r48 = localStorage.getItem(rawKey48),
            r60 = localStorage.getItem(rawKey60);
      if (r48 !== null && r60 !== null) {
        rawData['48'] = +r48;
        rawData['60'] = +r60;
        rawLoaded = true;
      }
      const e48 = localStorage.getItem(engKey48),
            e60 = localStorage.getItem(engKey60);
      if (e48 !== null) {
        engagedData['48'] = +e48;
        engagedLoaded = true;
      }
      if (e60 !== null) {
        engagedData['60'] = +e60;
      }
    }
  
    // watch the main toggle
    function watchToggle() {
      const toggle = document.getElementById('ytstudiotools-switch');
      if (!toggle) return setTimeout(watchToggle, 100);
      toggle.addEventListener('change', updateMusicCard);
      updateMusicCard(); // apply initial on toggle ready
    }
  
    // watch dropdown text changes
    function watchDropdown() {
      const orig = document.querySelector(
        '#mini-card-header .left-container.style-scope.ytcp-dropdown-trigger ' +
        'span.dropdown-trigger-text.style-scope.ytcp-text-dropdown-trigger'
      );
      if (!orig) return setTimeout(watchDropdown, 100);
      new MutationObserver(updateMusicCard)
        .observe(orig, { childList: true, characterData: true, subtree: true });
    }
  
    function injectDropdownText(text) {
      const container = document.querySelector(
        '#mini-card-header .left-container.style-scope.ytcp-dropdown-trigger'
      );
      if (!container) return;
      const orig = container.querySelector(
        'span.dropdown-trigger-text.style-scope.ytcp-text-dropdown-trigger'
      );
      if (!orig) return;
      orig.style.opacity = '0';
      let dup = container.querySelector('span.custom-ytstudiotools-text');
      if (!dup) {
        dup = document.createElement('span');
        dup.className = 'dropdown-trigger-text style-scope ytcp-text-dropdown-trigger custom-ytstudiotools-text';
        dup.style.marginTop = '-30px';
        dup.style.userSelect = 'none';
        orig.insertAdjacentElement('afterend', dup);
      }
      dup.textContent = text;
    }
  
    function showSpinner(el) {
      el.textContent = '';
      const spinner = document.createElement('div');
      spinner.className = 'ns-spinner';
      el.appendChild(spinner);
    }
  
    function updateMusicCard() {
      syncData(); // always refresh from storage
      const card = document.getElementById('mini-card-header')?.closest('.yta-latest-activity-card');
      if (!card) return;
  
      const metricContainers = card.querySelectorAll('.metric-container');
      if (metricContainers.length < 2) return;
      const container = metricContainers[1];
      const valueEl   = container.querySelector('.metric-value');
      const ddText    = container.querySelector(
        'span.dropdown-trigger-text.style-scope.ytcp-text-dropdown-trigger'
      )?.textContent || '';
      const using60   = ddText.includes('60');
      const on        = isEnabled();
      const period    = using60 ? '60' : '48';
  
      if (on && engagedLoaded) {
        // Engaged‑views mode, seeded from localStorage
        valueEl.textContent = engagedData[period].toLocaleString();
        injectDropdownText(using60
          ? `${prefix} · Last 60 minutes`
          : `${prefix} · Last 48 hours`
        );
      } else if (!on && rawLoaded) {
        // Raw‑views mode
        valueEl.textContent = rawData[period].toLocaleString();
        injectDropdownText(using60
          ? 'Views · Last 60 minutes'
          : 'Views · Last 48 hours'
        );
      } else if (on && !engagedLoaded && !engagedSpinnerShown) {
        showSpinner(valueEl);
        injectDropdownText(using60
          ? `${prefix} · Last 60 minutes`
          : `${prefix} · Last 48 hours`
        );
        engagedSpinnerShown = true;
      } else if (!on && !rawSpinnerShown) {
        showSpinner(valueEl);
        injectDropdownText(using60
          ? 'Views · Last 60 minutes'
          : 'Views · Last 48 hours'
        );
        rawSpinnerShown = true;
      }
    }
  
    // update on incoming data events
    window.addEventListener('ytstudiotoolsRawData',    updateMusicCard);
    window.addEventListener('ytstudiotoolsChannelData', updateMusicCard);
  
    // kick off watchers and initial render
    watchToggle();
    watchDropdown();
    updateMusicCard();
  })();  