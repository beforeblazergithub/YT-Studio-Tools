// inject.js
(function() {
  const origOpen  = XMLHttpRequest.prototype.open;
  const origSend  = XMLHttpRequest.prototype.send;
  const origSet   = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
    this._headers = this._headers || {};
    this._headers[header] = value;
    return origSet.apply(this, arguments);
  };

  XMLHttpRequest.prototype.open = function(method, url, async, user, pass) {
    this._url = url;
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    // 1) get_cards
    if (this._url?.includes("get_cards")) {
      this.addEventListener("readystatechange", () => {
        if (this.readyState === 4) {
          try {
            const json = JSON.parse(this.responseText);
            const card = Array.isArray(json.cards) &&
                         json.cards.find(c => c.latestActivityCardData);
            if (!card) return;

            // detect artist “total_reach-all” pages
            const isMusicPage = /\/artist\/[^/]+\/analytics\/tab-overview\/period-default\/total_reach-all/.test(window.location.href);

            if (isMusicPage) {
              // ── MUSIC PAGE: grab both 48 h and 60 min totals ──────────
              const vals48h = card.latestActivityCardData.datas[0]
                                .mainChartData.metricColumns[0].counts.values;
              const total48h   = vals48h.reduce((a, b) => a + b, 0);

              const vals60m = card.latestActivityCardData.datas[1]
                                .mainChartData.metricColumns[0].counts.values;
              const total60min = vals60m.reduce((a, b) => a + b, 0);

              // channel/artist ID
              const m = window.location.href.match(/\/(?:channel|artist)\/([^/]+)\//);
              const channelID = m ? m[1] : "";

              const raw48Key = channelID
                ? `ytstudiotools_raw_48_${channelID}`
                : "ytstudiotools_raw_48";
              const raw60Key = channelID
                ? `ytstudiotools_raw_60_${channelID}`
                : "ytstudiotools_raw_60";

              // emit both
              window.dispatchEvent(new CustomEvent("ytstudiotoolsRawData", {
                detail: { total48h, total60min }
              }));

              // persist
              localStorage.setItem(raw48Key, total48h);
              localStorage.setItem(raw60Key, total60min);
              console.log(`data48h: ${total48h}, data60min: ${total60min}`);

            } else {
              // ── CHANNEL/ARTIST OVERVIEW: original 48 h + last‑hour ──
              const vals     = card.latestActivityCardData.datas[0]
                                   .mainChartData.metricColumns[0].counts.values;
                                   // also stash the raw per-bar array for hover
              const m2 = window.location.href.match(/\/(?:channel|artist)\/([^/]+)\//);
              const channelID2 = m2 ? m2[1] : "";
              const keyVals = channelID2
                ? `ytstudiotools_raw_vals_${channelID2}`
                : `ytstudiotools_raw_vals`;
              localStorage.setItem(keyVals, JSON.stringify(vals));
              
              const total48h = vals.reduce((a, b) => a + b, 0);
              const lastHour = vals[vals.length - 1] || 0;

              const m = window.location.href.match(/\/(?:channel|artist)\/([^/]+)\//);
              const channelID = m ? m[1] : "";

              const raw48Key = channelID
                ? `ytstudiotools_raw_48_${channelID}`
                : "ytstudiotools_raw_48";
              const raw60Key = channelID
                ? `ytstudiotools_raw_60_${channelID}`
                : "ytstudiotools_raw_60";

              window.dispatchEvent(new CustomEvent("ytstudiotoolsRawData", {
                detail: { total48h, lastHour }
              }));

              localStorage.setItem(raw48Key, total48h);
              localStorage.setItem(raw60Key, lastHour);
              console.log(`data: ${total48h}, ${lastHour}`);
            }
          } catch {
            /* silent */
          }
        }
      });
    }

    // 2) get_screen stash, first reuse
    if (this._url?.includes("get_screen?alt=json")) {
      const storage = location.href.includes('/video/') ? sessionStorage : localStorage;
      storage.setItem("interceptedPayload", body);
      storage.setItem("interceptedHeaders", JSON.stringify(this._headers || {}));
      this.addEventListener("readystatechange", () => {});
    }

    return origSend.apply(this, arguments);
  };
})();