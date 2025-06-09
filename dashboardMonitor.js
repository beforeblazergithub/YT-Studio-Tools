(() => {
  console.log('[DBG] dashboardMonitor.js starting…');

  let lastReq = null;

  const DASH_REGEX_PRIMARY  = /get_channel_dashboard\?alt=json($|&)/;
  const DASH_REGEX_FALLBACK = /youtubei\/v1\/creator\/get_channel_dashboard/;
  const ALT_JSON_EXACT      = /get_channel_dashboard\?alt=json$/;

  const _fetch = window.fetch;
  window.fetch = function(resource, init = {}) {
    const url = typeof resource === 'string' ? resource : resource.url;
    if (DASH_REGEX_PRIMARY.test(url) || DASH_REGEX_FALLBACK.test(url)) {
      console.log('[DBG] → Captured dashboard fetch request!', resource, init);
      lastReq = {
        method:  init.method || 'GET',
        url,
        headers: init.headers || {},
        body:    init.body || null
      };
    }
    return _fetch.apply(this, arguments);
  };

  const _open = XMLHttpRequest.prototype.open;
  const _set  = XMLHttpRequest.prototype.setRequestHeader;
  const _send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._method = method;
    this._url    = url;
    return _open.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    this._headers = this._headers || {};
    this._headers[name] = value;
    return _set.apply(this, [name, value]);
  };

  XMLHttpRequest.prototype.send = function(body) {
    if (DASH_REGEX_PRIMARY.test(this._url) || DASH_REGEX_FALLBACK.test(this._url)) {
      console.log('[DBG] → Captured dashboard XHR request!', this._url);
      lastReq = {
        method:  this._method,
        url:     this._url,
        headers: { ...(this._headers||{}) },
        body
      };
    }
    return _send.apply(this, [body]);
  };
  function updateSubscriberCard(total, delta, updateTrend = true) {
    let card = null;
    document
      .querySelectorAll('.apply-item-padding.style-scope.ytcd-channel-facts-item')
      .forEach(c => {
        const title = c.querySelector('.subscribers-title');
        if (title && title.textContent.trim() === 'Current subscribers') {
          card = c;
        }
      });
    if (!card) return;

    const bigEl = card.querySelector('.metric-value-big');
    if (bigEl) bigEl.textContent = total.toLocaleString();

    if (updateTrend) {
      const trendContainer = card.querySelector('.subscribers-trend');
      if (!trendContainer) return;

      let trendEl = trendContainer.querySelector('span');
      if (!trendEl) {
        trendEl = document.createElement('span');
        trendContainer.insertBefore(trendEl, trendContainer.firstChild);
      }
      const sign = delta > 0 ? '+' : '';
      trendEl.textContent = sign + delta.toLocaleString();
      trendEl.classList.toggle('trend-diff-up', delta >= 0);
      trendEl.classList.toggle('trend-diff-down', delta < 0);
    }
  }

  const waiter = setInterval(() => {
    if (!lastReq) return;
    clearInterval(waiter);
    console.log('[DBG] Dashboard request captured — starting replay…');

    setInterval(() => {
      console.log('[DBG][replay] sending dashboard request:', lastReq);
      const xhr = new XMLHttpRequest();
      xhr.open(lastReq.method, lastReq.url, true);
      for (const h in lastReq.headers) {
        xhr.setRequestHeader(h, lastReq.headers[h]);
      }
      xhr.onload = () => {
        console.log('[DBG][replay] got response');
        try {
          const json = JSON.parse(xhr.responseText);
          const factsCard = json.cards.find(c =>
            c.id === 'facts' ||
            !!c.body?.basicCard?.item?.channelFactsItem?.channelFactsData
          );
          if (!factsCard) {
            console.log('[DBG][replay] no facts card');
            return;
          }
          const results = factsCard
            .body
            .basicCard
            .item
            .channelFactsItem
            .channelFactsData
            .results;

          function extractNet(entry) {
            const table = entry.value.resultTable;
            if (Array.isArray(table.metricColumns)) {
              return table.metricColumns
                .find(m => m.metric.type === 'SUBSCRIBERS_NET_CHANGE')
                .counts.values[0];
            } else if (Array.isArray(table.resultColumns)) {
              return table.resultColumns
                .find(c => c.column.type === 'SUBSCRIBERS_NET_CHANGE')
                .values[0].double;
            } else {
              throw new Error('no metricColumns or resultColumns');
            }
          }

          const lifeEntry = results.find(r =>
            r.key === 'DASHBOARD_FACT_ANALYTICS_LIFETIME_SUBSCRIBERS'
          );
          if (!lifeEntry) {
            console.log('[DBG][replay] missing lifetime-subscribers entry');
            return;
          }

          const currEntry = results.find(r =>
            r.key === 'DASHBOARD_FACT_ANALYTICS_CURRENT'
          );

          const total = extractNet(lifeEntry);
          const delta = ALT_JSON_EXACT.test(lastReq.url)
            ? (currEntry ? extractNet(currEntry) : total)
            : 0;

          const shouldUpdateTrend = ALT_JSON_EXACT.test(lastReq.url);

          console.log('[DBG][replay] total=', total, 'delta=', delta);

          updateSubscriberCard(total, delta, shouldUpdateTrend);

          if (!shouldUpdateTrend) {
            console.log(
              '[DBG][replay] skipped trend for extra-param URL:',
              lastReq.url
            );
          }
        } catch (err) {
          console.log('[DBG][replay] error parsing response', err);
        }
      };
      xhr.onerror = () => console.log('[DBG][replay] network error');
      xhr.send(lastReq.body);
    }, 5000);

  }, 100);
})();