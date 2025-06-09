(function() {
    if (document.readyState === "loading") {
        window.analyticsPayloadCache = {};
      } else {
        window.analyticsPayloadCache = window.analyticsPayloadCache || {};
      }
    // suppress certain console logs
    const prefixes = ["m=core:1176", "Name: Error"];
    function overrideConsole(method) {
      const original = console[method];
      console[method] = (...args) => {
        if (args.some(a => typeof a === "string" && prefixes.some(p => a.includes(p)))) {
          return;
        }
        original.apply(console, args);
      };
    }
    overrideConsole("log");
    overrideConsole("warn");
    overrideConsole("error");
  })();
  
  (function() {

    // Retrieve extension ID from content.js
    let extension_ID = localStorage.getItem("extension_ID_ytstudiotools");
    if (!extension_ID) {
      document.addEventListener("receiveExtensionId", e => {
        extension_ID = e.detail;
        localStorage.setItem("extension_ID_ytstudiotools", extension_ID);
        console.log("[dynamicRequest] Extension ID set to", extension_ID);
      });
    } else {
      console.log("[dynamicRequest] Using stored Extension ID:", extension_ID);
    }
  
    function classifyVideos(videoIds) {
      return new Promise(resolve => {
        window.postMessage({ type: 'CLASSIFY_VIDEO_IDS', videoIds }, '*');
        function handler(event) {
          if (
            event.source === window &&
            event.data?.type === 'CLASSIFY_VIDEO_IDS_RESULT'
          ) {
            window.removeEventListener('message', handler);
            const map = new Map(
              event.data.videos.map(v => [v.videoId, v.videoType])
            );
            resolve(map);
          }
        }
        window.addEventListener('message', handler);
      });
    }
  
    // Clear any existing interval
    if (window.dynamicRequestInterval) {
      clearInterval(window.dynamicRequestInterval);
      window.dynamicRequestInterval = null;
    }
  
    // URL matchers
    function isChannelOrArtistAnalyticsURL(url) {
         return /\/(?:channel|artist)\/[^/]+\/analytics\/tab-overview(?:\/period-[^/]+)?(?:[\/?]|$)/.test(url);
     }
    function isVideoAnalyticsURL() {
      return /\/analytics\/tab-overview(?:\/|$|\?)/.test(window.location.pathname + window.location.search);
    }
    function isValidAnalyticsURL() {
      return /^https:\/\/studio\.youtube\.com\/(?:video|channel|artist)\/[^/]+\/analytics\/tab-overview\/period-default/.test(window.location.href);
    }    
  
    // Wait for the intercept from inject.js
    /**
 * Wait up to 200 ms for a fresh interceptedPayload in localStorage.
 * If none appears, fall back to the last‑known cache for this entity.
 */
    function waitForInterceptedData(
        initialTimeout = 15000,
        fallbackTimeout = 200,
        interval = 50
      ) {
        const url = window.location.href;
        let entityId = "_default";
        const vMatch = url.match(/\/video\/([^/]+)\/analytics/);
        const cMatch = url.match(/\/(?:channel|artist)\/([^/]+)\/analytics/);
        if (vMatch) entityId = vMatch[1];
        else if (cMatch) entityId = cMatch[1];
    
        const hasCache = !!window.analyticsPayloadCache[entityId];
        const timeout = hasCache ? fallbackTimeout : initialTimeout;
    
        return new Promise((resolve, reject) => {
          const start = Date.now();
          (function check() {
            const storage = location.href.includes('/video/') ? sessionStorage : localStorage;
            const p = storage.getItem("interceptedPayload");
            const h = storage.getItem("interceptedHeaders");
    
            if (p && h) {
              // consume & cache the new intercept
              storage.removeItem("interceptedPayload");
              storage.removeItem("interceptedHeaders");
              window.analyticsPayloadCache[entityId] = { payloadStr: p, headersStr: h };
              return resolve({ payloadStr: p, headersStr: h });
            }
    
            if (Date.now() - start > timeout) {
              // timed out → either fallback or error
              if (hasCache) {
                return resolve(window.analyticsPayloadCache[entityId]);
              } else {
                return reject(new Error(
                  `No intercepted data within ${timeout}ms and no cache for ${entityId}`
                ));
              }
            }
    
            setTimeout(check, interval);
          })();
        });
      }
  
    // Date‑range helper (last 28 days)
    const today = new Date();
    const exclusiveEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const inclusiveStart = new Date(exclusiveEnd);
    inclusiveStart.setDate(exclusiveEnd.getDate() - 28);
    function formatDateId(d) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth()+1).padStart(2,'0');
      const dd = String(d.getDate()).padStart(2,'0');
      return parseInt(`${yyyy}${mm}${dd}`,10);
    }
    const dateIdRange = {
      inclusiveStart: formatDateId(inclusiveStart),
      exclusiveEnd:   formatDateId(exclusiveEnd)
    };
  
    // Helper to find the right data point ≤ targetTimestamp
    function findDatumForTimestamp(datums, ts) {
      for (let i = datums.length - 1; i >= 0; i--) {
        if (datums[i].x <= ts) return datums[i];
      }
      return datums[0];
    }
  
    // Clone payload & set the right tab + videoId
    function makePayloadForTab(tabId, basePayload, videoId) {
      const p = JSON.parse(JSON.stringify(basePayload));
      if (p.screenConfig?.entity) {
        p.screenConfig.entity.videoId = videoId;
        delete p.screenConfig.entity.channelId;
      }
      p.desktopState.tabId = tabId;
      return p;
    }
  
    // Fire the POST to get_screen
    function sendRequestForPayload(payload, headers, videoId, videoType, callback) {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "https://studio.youtube.com/youtubei/v1/yta_web/get_screen?alt=json", true);
      for (const k in headers) xhr.setRequestHeader(k, headers[k]);
      xhr.onreadystatechange = () => {
        if (xhr.readyState !== 4) return;
        let resp;
        try {
          resp = JSON.parse(xhr.responseText);
        } catch (e) {
          console.error("[dynamicRequest] parse error for", videoId, e);
          return callback(null);
        }
  
        // ─── Longform / livestream real‑time card ───
        const rtCard = Array.isArray(resp.cards)
          ? resp.cards.find(c => c.latestActivityCardData?.datas)
          : null;
        if (videoType !== "shorts" && rtCard) {
          const datas = rtCard.latestActivityCardData.datas;
          const sum = d => (d.mainChartData?.metricColumns?.[0]?.counts.values || []).reduce((a,b)=>a+b,0);
          const d48 = datas.find(d=>d.timePeriod==="ANALYTICS_TIME_PERIOD_TYPE_REALTIME_LAST_48_HOURS");
          const d60 = datas.find(d=>d.timePeriod==="ANALYTICS_TIME_PERIOD_TYPE_REALTIME_LAST_60_MINUTES");
          const result = {
                        videoId,
                        totalLast60Minutes: d60 ? sum(d60) : 0,
                        totalLast48Hours:   d48 ? sum(d48) : 0,
                       metricUsed: "LATEST_ACTIVITY"
                     };
                      /* broadcast for uiToggle.js → Realtime‑card swap */
                      window.dispatchEvent(
                        new CustomEvent('ytstudiotoolsRealtimeData', { detail: result })
                      );
                      return callback(result);
          return callback({
            videoId,
            totalLast60Minutes: d60 ? sum(d60) : 0,
            totalLast48Hours:   d48 ? sum(d48) : 0,
            metricUsed: "LATEST_ACTIVITY"
          });
        }
  
        // ─── Shorts / fallback via keyMetricCardData ───
        if (!Array.isArray(resp.cards)) {
          console.error("[dynamicRequest] no cards for", videoId);
          return callback(null);
        }
        const card = resp.cards.find(c => c.keyMetricCardData);
        const tabs = card?.keyMetricCardData?.keyMetricTabs;
        if (!tabs) {
          console.error("[dynamicRequest] no keyMetricTabs for", videoId);
          return callback(null);
        }
  
        let metric = "ENGAGED_VIEWS";
        let metricTab = tabs.find(t=>t.primaryContent?.metric===metric || t.metricTabConfig?.metric===metric);
        if (!metricTab) {
          metric = "EXTERNAL_VIEWS";
          metricTab = tabs.find(t=>t.primaryContent?.metric===metric || t.metricTabConfig?.metric===metric);
        }
        if (!metricTab) {
          if (videoType==="shorts") {
            console.log(`[dynamicRequest] ${metric} missing for ${videoId}, available:`,
              tabs.map(t=>t.primaryContent?.metric||t.metricTabConfig?.metric));
          }
          return callback(null);
        }
  
        const pc    = metricTab.primaryContent;
    const dat   = pc.mainSeries.datums;
    const unit  = pc.mainSeries.timeUnit;
    const current = pc.total ?? dat[dat.length - 1].y;

    // Hoist lastX once
    const lastX = dat[dat.length - 1].x;
    let v60, v48;

    if (unit.includes("MINUTES") || unit.includes("HOURS")) {
      v60 = findDatumForTimestamp(dat, lastX -  3600_000).y || 0;
      v48 = findDatumForTimestamp(dat, lastX - 48*3600_000).y || 0;
    }
    else if (unit.includes("DAYS")) {
      v48 = findDatumForTimestamp(dat, lastX - 48*3600_000).y || 0;
      v60 = findDatumForTimestamp(dat, lastX -  3600_000).y || 0;

      if (dat.length >= 2) {
        const prev     = dat[dat.length - 2];
        const diffDays = (lastX - prev.x) / (24 * 3600_000);
        const interp   = diffDays > 0 ? (current - prev.y) / (diffDays * 24) : 0;
        v60 = current - Math.max(interp, (current - prev.y) / 24);
      } else {
        v60 = dat[0].y;
      }
    }
    else {
      v60 = findDatumForTimestamp(dat, lastX -  3600_000).y || 0;
      v48 = findDatumForTimestamp(dat, lastX - 48*3600_000).y || 0;
    }

    const result = {
      videoId,
      currentViews:  Math.round(current),
      estimated60:   Math.round(v60),
      gained60:      Math.round(current - v60),
      estimated48:   Math.round(v48),
      gained48:      Math.round(current - v48),
      metricUsed:    metric
    };

    // Debug log
    console.log(
      `[debug] ${videoId}`,
      `unit=${unit}`,
      `points=${dat.length}`,
      `current=${current}`,
      `baseline48=${v48}`,
      `gained48=${current - v48}`
    );

    window.dispatchEvent(
      new CustomEvent('ytstudiotoolsRealtimeData', { detail: result })
    );
    callback(result);
  };

  xhr.send(JSON.stringify(payload));
    }
  
    // ─── Main runner ───
    function runDynamicRequest() {
      if (!isValidAnalyticsURL()) {
        console.log("[dynamicRequest] URL no longer analytics → stopping");
        stopDynamicInterval();
        return;
      }
  
      waitForInterceptedData()
        .then(({ payloadStr, headersStr }) => {
          const basePayload = JSON.parse(payloadStr);
          const headers     = JSON.parse(headersStr);
  
          // ─── Channel/Artist dashboard ───
          if (isChannelOrArtistAnalyticsURL(window.location.href)) {
            // extract channelID
            const m = window.location.href.match(/\/(?:channel|artist)\/([^/]+)\/analytics/);
            let channelID = m?.[1];
            if (window.location.href.includes("/artist/") &&
                basePayload.screenConfig?.entity?.artistDetails?.oacChannelId) {
              channelID = basePayload.screenConfig.entity.artistDetails.oacChannelId;
            }
            console.log("[dynamicRequest] Channel analytics for", channelID);
  
            // build JOIN payload
            const joinUrl = "https://studio.youtube.com/youtubei/v1/yta_web/join?alt=json";
                  const joinPayload = {
                      nodes: [{
                              key: "0__TOTALS_SUMS_QUERY_KEY",
                              value: {
                                  query: {
                                      dimensions: [],
                                      metrics: [{
                                              type: "EXTERNAL_VIEWS",
                                              includeTotal: true
                                          },
                                          {
                                              type: "EXTERNAL_WATCH_TIME",
                                              includeTotal: true
                                          },
                                          {
                                              type: "SUBSCRIBERS_NET_CHANGE",
                                              includeTotal: true
                                          },
                                          {
                                              type: "VIDEO_THUMBNAIL_IMPRESSIONS",
                                              includeTotal: true
                                          },
                                          {
                                              type: "VIDEO_THUMBNAIL_IMPRESSIONS_VTR",
                                              includeTotal: true
                                          }
                                      ],
                                      restricts: [{
                                          dimension: {
                                              type: "USER"
                                          },
                                          inValues: [channelID]
                                      }],
                                      orders: [],
                                      timeRange: {
                                          dateIdRange
                                      },
                                      currency: "USD",
                                      returnDataInNewFormat: true,
                                      limitedToBatchedData: false
                                  }
                              }
                          },
                          {
                              key: "1__TOTALS_TIMELINE_QUERY_KEY",
                              value: {
                                  query: {
                                      dimensions: [{
                                          type: "DAY"
                                      }],
                                      metrics: [{
                                          type: "EXTERNAL_VIEWS"
                                      }],
                                      restricts: [{
                                          dimension: {
                                              type: "USER"
                                          },
                                          inValues: [channelID]
                                      }],
                                      orders: [{
                                          dimension: {
                                              type: "DAY"
                                          },
                                          direction: "ANALYTICS_ORDER_DIRECTION_ASC"
                                      }],
                                      timeRange: {
                                          dateIdRange
                                      },
                                      currency: "USD",
                                      returnDataInNewFormat: true,
                                      limitedToBatchedData: false
                                  }
                              }
                          },
                          {
                              key: "2__TOP_ENTITIES_TABLE_QUERY_KEY",
                              value: {
                                  query: {
                                      dimensions: [{
                                          type: "VIDEO"
                                      }],
                                      metrics: [{
                                              type: "EXTERNAL_VIEWS",
                                              asPercentagesOfTotal: true
                                          },
                                          {
                                              type: "EXTERNAL_VIEWS",
                                              includeTotal: true
                                          },
                                          {
                                              type: "EXTERNAL_WATCH_TIME",
                                              asPercentagesOfTotal: true
                                          },
                                          {
                                              type: "EXTERNAL_WATCH_TIME",
                                              includeTotal: true
                                          },
                                          {
                                              type: "SUBSCRIBERS_NET_CHANGE",
                                              asPercentagesOfTotal: true
                                          },
                                          {
                                              type: "SUBSCRIBERS_NET_CHANGE",
                                              includeTotal: true
                                          },
                                          {
                                              type: "VIDEO_THUMBNAIL_IMPRESSIONS",
                                              asPercentagesOfTotal: true
                                          },
                                          {
                                              type: "VIDEO_THUMBNAIL_IMPRESSIONS",
                                              includeTotal: true
                                          },
                                          {
                                              type: "VIDEO_THUMBNAIL_IMPRESSIONS_VTR",
                                              asPercentagesOfTotal: true
                                          },
                                          {
                                              type: "VIDEO_THUMBNAIL_IMPRESSIONS_VTR",
                                              includeTotal: true
                                          }
                                      ],
                                      restricts: [{
                                          dimension: {
                                              type: "USER"
                                          },
                                          inValues: [channelID]
                                      }],
                                      orders: [{
                                          metric: {
                                              type: "EXTERNAL_VIEWS"
                                          },
                                          direction: "ANALYTICS_ORDER_DIRECTION_DESC"
                                      }],
                                      timeRange: {
                                          dateIdRange
                                      },
                                      limit: {
                                          pageSize: 500,
                                          pageOffset: 0
                                      },
                                      currency: "USD",
                                      returnDataInNewFormat: true,
                                      limitedToBatchedData: false
                                  }
                              }
                          },
                          {
                              key: "2__TOP_ENTITIES_CHARTS_QUERY_KEY",
                              value: {
                                  query: {
                                      dimensions: [{
                                          type: "DAY"
                                      }, {
                                          type: "VIDEO"
                                      }],
                                      metrics: [{
                                          type: "EXTERNAL_VIEWS"
                                      }],
                                      restricts: [{
                                          dimension: {
                                              type: "USER"
                                          },
                                          inValues: [channelID]
                                      }],
                                      orders: [{
                                              dimension: {
                                                  type: "VIDEO"
                                              },
                                              direction: "ANALYTICS_ORDER_DIRECTION_ASC"
                                          },
                                          {
                                              dimension: {
                                                  type: "DAY"
                                              },
                                              direction: "ANALYTICS_ORDER_DIRECTION_ASC"
                                          }
                                      ],
                                      timeRange: {
                                          dateIdRange
                                      },
                                      currency: "USD",
                                      returnDataInNewFormat: true,
                                      limitedToBatchedData: false
                                  }
                              }
                          },
                          {
                              key: "2__TOP_ENTITIES_TABLE_QUERY_KEY_VIDEO",
                              value: {
                                  getCreatorVideos: {
                                      mask: {
                                          videoId: true,
                                          title: true,
                                          permissions: {
                                              all: true
                                          },
                                          channelId: true,
                                          lengthSeconds: true,
                                          timePublishedSeconds: true,
                                          status: true,
                                          privacy: true,
                                          metrics: {
                                              all: true
                                          },
                                          thumbnailDetails: {
                                              all: true
                                          }
                                      }
                                  }
                              }
                          },
                          {
                              key: "2__TOP_ENTITIES_TABLE_QUERY_KEY_VIDEO_ANALYTICS_REFERRER_CHANNEL",
                              value: {
                                  getCreatorChannels: {
                                      mask: {
                                          channelId: true,
                                          title: true,
                                          permissions: {
                                              overallPermissions: true
                                          },
                                          metric: {
                                              all: true
                                          },
                                          thumbnailDetails: {
                                              all: true
                                          },
                                          timeCreatedSeconds: true
                                      }
                                  }
                              }
                          }
                      ],
                      connectors: [{
                              extractorParams: {
                                  resultKey: "2__TOP_ENTITIES_TABLE_QUERY_KEY",
                                  resultTableExtractorParams: {
                                      dimension: {
                                          type: "VIDEO"
                                      }
                                  }
                              },
                              fillerParams: {
                                  targetKey: "2__TOP_ENTITIES_CHARTS_QUERY_KEY",
                                  queryFillerParams: {
                                      dimension: {
                                          type: "VIDEO"
                                      }
                                  }
                              }
                          },
                          {
                              extractorParams: {
                                  resultKey: "2__TOP_ENTITIES_TABLE_QUERY_KEY",
                                  resultTableExtractorParams: {
                                      dimension: {
                                          type: "VIDEO"
                                      }
                                  }
                              },
                              fillerParams: {
                                  targetKey: "2__TOP_ENTITIES_TABLE_QUERY_KEY_VIDEO",
                                  idFillerParams: {}
                              }
                          },
                          {
                              extractorParams: {
                                  resultKey: "2__TOP_ENTITIES_TABLE_QUERY_KEY_VIDEO",
                                  referrerExtractorParams: {
                                      type: "ANALYTICS_REFERRER_CHANNEL"
                                  }
                              },
                              fillerParams: {
                                  targetKey: "2__TOP_ENTITIES_TABLE_QUERY_KEY_VIDEO_ANALYTICS_REFERRER_CHANNEL",
                                  idFillerParams: {}
                              }
                          }
                      ],
                      allowFailureResultNodes: true,
                      context: basePayload.context,
                      trackingLabel: basePayload.trackingLabel
                  };

                  const xhr = new XMLHttpRequest();
          xhr.open("POST", joinUrl, true);
          Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
          xhr.setRequestHeader("Content-Type", "application/json");

          xhr.onreadystatechange = () => {
            if (xhr.readyState !== 4 || xhr.status !== 200) return;
            const resp = JSON.parse(xhr.responseText);
            const topNode = resp.results.find(n => n.key === "2__TOP_ENTITIES_TABLE_QUERY_KEY");
            (function(){
                          const table = topNode?.value?.resultTable;
if (
  table &&
  Array.isArray(table.dimensionColumns) &&
  table.dimensionColumns[0]?.strings?.values &&
  Array.isArray(table.metricColumns) &&
  table.metricColumns[0]?.counts?.values
) {
  const ids   = table.dimensionColumns[0].strings.values;
  const views = table.metricColumns[0].counts.values;
  window._ytstudiotools_originalTopContent = { channelId, ids, views };
} else {
}

                 })();
            const rawIds    = topNode?.value?.resultTable?.dimensionColumns?.[0]?.strings?.values || [];
            const ids       = [...new Set(rawIds)];
            console.log("[dynamicRequest] Retrieved video IDs:", rawIds);
            console.log("[dynamicRequest] Unique video IDs:", ids);

            // 2) classify only unique IDs
            classifyVideos(ids).then(typeMap => {
              // 3) aggregator only over unique IDs
              const aggregator = {
                totalVideos:    ids.length,
                individualStats: [],
                totalGained60:  0,
                totalGained48:  0
              };
              const seen       = new Set();
              let   done       = 0;
              
              const collect = result => {
                // only add each video once
                if (result && !seen.has(result.videoId)) {
                  seen.add(result.videoId);
                  aggregator.individualStats.push(result);
              
                  // update your totals
                  const g60 = result.gained60 != null
                             ? result.gained60
                             : (result.totalLast60Minutes || 0);
                  const g48 = result.gained48 != null
                             ? result.gained48
                             : (result.totalLast48Hours  || 0);
                  aggregator.totalGained60 += g60;
                  aggregator.totalGained48 += g48;
                }
              
                // once we've gotten back one callback per requested ID…
                if (++done === ids.length) {
                  // 1) Filter out zero-traffic videos
                  const validStats = aggregator.individualStats.filter(stat => {
                    if (stat.metricUsed === 'ENGAGED_VIEWS') {
                      return stat.gained48 > 0 || stat.gained60 > 0;
                    } else {
                      return stat.totalLast48Hours > 0 || stat.totalLast60Minutes > 0;
                    }
                  });
                
                  // 2) Count only those with data
                  const totalWithData  = validStats.length;
                  const shortsWithData = validStats.filter(s => typeMap.get(s.videoId) === 'shorts').length;
                
                  // 3) Decide channel type
                  let channelType;
                  if      (shortsWithData === 0)             channelType = 'All longform videos';
                  else if (shortsWithData === totalWithData) channelType = 'All shorts';
                  else                                       channelType = `Mixed`;

                  localStorage.setItem('ytstudiotools_channel_type', channelType);
                
                  // 5) Then your existing dispatch
                  console.log("Channel/Artist Aggregated Stats:", JSON.stringify(aggregator, null, 2));
                  console.log(`[ytstudiotools] Detected channel composition: ${channelType}`);
                  window.dispatchEvent(
                    new CustomEvent('ytstudiotoolsChannelData', { detail: aggregator })
                  );
                }                
              };

              // 4) fire one get_screen per unique ID
              ids.forEach(videoId => {
                const videoType = typeMap.get(videoId) || 'longform';
                const tabId     = (videoType === 'shorts')
                                  ? 'ANALYTICS_TAB_ID_ENGAGEMENT'
                                  : 'ANALYTICS_TAB_ID_OVERVIEW';
                sendRequestForPayload(
                  makePayloadForTab(tabId, basePayload, videoId),
                  headers,
                  videoId,
                  videoType,
                  collect
                );
              });
            }).catch(err => {
              console.error("[dynamicRequest] /classify-video-ids failed:", err);
            });
          };

          xhr.send(JSON.stringify(joinPayload));
          return;
        }

        // ─── Single‑video dashboard ─────────────────────────────────────────────
        if (isVideoAnalyticsURL()) {
          const vidMatch = window.location.href.match(/\/video\/([^/]+)\/analytics/);
          if (!vidMatch) {
            console.error("[dynamicRequest] Video ID not found in URL.");
            return;
          }
          const videoId = vidMatch[1];

          // 1) classify this one ID
          classifyVideos([videoId]).then(typeMap => {
            const videoType = typeMap.get(videoId) || 'longform';

            if (videoType === 'shorts') {
              // ── Shorts: first ENGAGEMENT ─────────────────────────────────────
              const engPayload = JSON.parse(JSON.stringify(basePayload));
              engPayload.desktopState.tabId = "ANALYTICS_TAB_ID_ENGAGEMENT";

              sendRequestForPayload(engPayload, headers, videoId, videoType, engResult => {
                if (!engResult) {
                  console.error("[dynamicRequest] Missing engagement data for Shorts:", videoId);
                  return;
                }

                // ── then OVERVIEW ───────────────────────────────────────────────
                const ovPayload = JSON.parse(JSON.stringify(basePayload));
                ovPayload.desktopState.tabId = "ANALYTICS_TAB_ID_OVERVIEW";

                sendRequestForPayload(ovPayload, headers, videoId, 'longform', ovResult => {
                  if (!ovResult) {
                    console.error("[dynamicRequest] Missing overview data for Shorts:", videoId);
                    // fallback: just dispatch engagement
                    window.dispatchEvent(new CustomEvent('ytstudiotoolsRealtimeData', { detail: engResult }));
                    return;
                  }

                  // ── 3) merge both into one payload ────────────────────────────
                  const combined = {
                    videoId,
                    // engaged stats
                    gained60:  engResult.gained60  ?? engResult.totalLast60Minutes ?? 0,
                    gained48:  engResult.gained48  ?? engResult.totalLast48Hours   ?? 0,
                    // total views stats
                    totalLast60Minutes: ovResult.totalLast60Minutes ?? 0,
                    totalLast48Hours:   ovResult.totalLast48Hours   ?? 0,
                    // for debugging
                    metricUsedEngagement: engResult.metricUsed,
                    metricUsedOverview:   ovResult.metricUsed
                  };
                  console.log("Video Aggregated Stats (shorts combined):", combined);
                  window.dispatchEvent(new CustomEvent('ytstudiotoolsRealtimeData', { detail: combined }));
                });
              });

            } else {
              // ── Longform: original overview‑only behavior ────────────────────
              const ovPayload = JSON.parse(JSON.stringify(basePayload));
              ovPayload.desktopState.tabId = "ANALYTICS_TAB_ID_OVERVIEW";

              sendRequestForPayload(ovPayload, headers, videoId, videoType, ovResult => {
                if (ovResult) {
                  console.log("Video Aggregated Stats (overview):", ovResult);
                  window.dispatchEvent(new CustomEvent('ytstudiotoolsRealtimeData', { detail: ovResult }));
                } else {
                  console.error("[dynamicRequest] No analytics data for videoID:", videoId);
                }
              });
            }
          }).catch(err => {
            console.error("[dynamicRequest] classifyVideos failed:", err);
            // on classification error, fall back to overview only
            const ovPayload = JSON.parse(JSON.stringify(basePayload));
            ovPayload.desktopState.tabId = "ANALYTICS_TAB_ID_OVERVIEW";
            sendRequestForPayload(ovPayload, headers, videoId, 'longform', ovResult => {
              if (ovResult) window.dispatchEvent(new CustomEvent('ytstudiotoolsRealtimeData', { detail: ovResult }));
            });
          });

          return;
        }


      })
      .catch(err => console.error("[dynamicRequest] waiting for data →", err));
  }

  // interval controls
  function startDynamicInterval() {
    if (!window.dynamicRequestInterval) {
      window.dynamicRequestInterval = setInterval(() => {
        if (isValidAnalyticsURL()) runDynamicRequest();
        else stopDynamicInterval();
      }, 10000);
    }
  }
  function stopDynamicInterval() {
    clearInterval(window.dynamicRequestInterval);
    window.dynamicRequestInterval = null;
  }

  // kick it off
  runDynamicRequest();
  startDynamicInterval();
})();