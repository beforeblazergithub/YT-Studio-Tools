// chartHover.js
(function(){
    const BAR_SEL = '#chart-container .bar-group path.bar';
    const m       = window.location.href.match(/\/(?:channel|artist)\/([^/]+)\//);
    const channel = m ? m[1] : '';

    const rawTotalKey48 = channel
      ? `ytstudiotools_raw_48_${channel}`
      : 'ytstudiotools_raw_48';
    const engTotalKey48 = channel
      ? `ytstudiotools_eng_48_${channel}`
      : 'ytstudiotools_eng_48';

    function getRatio() {
      const raw = parseFloat(localStorage.getItem(rawTotalKey48)) || 1;
      const eng = parseFloat(localStorage.getItem(engTotalKey48)) || 0;
      return eng / raw;
    }

    function isEngagedMode() {
      return localStorage.getItem('ytstudiotoolsEnabled') === 'true';
    }

    function getValues() {
      try {
        return JSON.parse(
          localStorage.getItem(
            channel
              ? `ytstudiotools_raw_vals_${channel}`
              : 'ytstudiotools_raw_vals'
          )
        ) || [];
      } catch {
        console.error('[chartHover] bad JSON in raw_vals');
        return [];
      }
    }

    function attach() {
      const bars   = document.querySelectorAll(BAR_SEL);
      const values = getValues();
      if (!bars.length || values.length < bars.length) return false;

      const svg  = bars[0].ownerSVGElement;
      const svgH = svg.viewBox.baseVal.height || parseFloat(svg.getAttribute('height')||'0');
      clearInterval(poll);

      bars.forEach((bar, idx) => {
        const rawV  = values[idx];
        const group = bar.parentElement;

        let hit = group.querySelector('rect.hover-overlay');
        if (!hit) {
          const bbox = bar.getBBox();
          hit = document.createElementNS('http://www.w3.org/2000/svg','rect');
          hit.setAttribute('x',      bbox.x);
          hit.setAttribute('width',  bbox.width);
          hit.setAttribute('y',      0);
          hit.setAttribute('height', svgH);
          hit.setAttribute('fill',   'transparent');
          hit.setAttribute('class',  'hover-overlay');
          group.insertBefore(hit, bar);
        }

        const updateHoverValue = () => {
          const chartEl = hit.closest('yta-line-chart-base#chart');
          if (!chartEl) return;
          const hv = chartEl.querySelector('.aplos-hovercard .yta-hovercard #value');
          if (!hv) return;

          // re-compute on every hover
          const ratio    = getRatio();
          const engaged  = isEngagedMode();
          const displayV = engaged
            ? Math.round(rawV * ratio)
            : rawV;

          hv.textContent = displayV.toLocaleString();
        };

        ['mouseenter','mousemove'].forEach(evt => {
          bar.addEventListener(evt, updateHoverValue);
          hit.addEventListener(evt, updateHoverValue);
        });
      });

      return true;
    }

    const poll = setInterval(attach,10);
})();