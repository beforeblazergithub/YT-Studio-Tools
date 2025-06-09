(function(){
  if (location.pathname.includes('/analytics/')) return;
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('dashboardMonitor.js');
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);
})();