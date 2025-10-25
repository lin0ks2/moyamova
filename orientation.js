
/*! orientation.js — portrait-only enforcement for MOYAMOVA (enhanced i18n listeners) */
(function () {
  const isIOS = /iP(hone|od|ad)/.test(navigator.platform) || 
                (navigator.userAgent.includes("Mac") && "ontouchend" in document);
  const $ = (s, d=document) => d.querySelector(s);

  function tr(key, fallback) {
    try {
      if (typeof window.T === 'function') return window.T(key, fallback);
      if (window.I18N && typeof window.getUiLang === 'function') {
        const lang = window.getUiLang();
        return (window.I18N[lang] && window.I18N[lang][key]) || fallback;
      }
    } catch(e){/* noop */}
    return fallback;
  }

  function ensureStyles() {
    if ($('#orientation-lock-style')) return;
    const css = `
      .orientation-overlay {
        position: fixed; inset: 0; background: #fff; color: #111;
        display: none; align-items: center; justify-content: center;
        text-align: center; z-index: 99999; padding: 24px;
      }
      .orientation-overlay .card {
        max-width: 520px; margin: 0 auto; font: 16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif;
      }
      .orientation-overlay h2 { margin: 0 0 8px; font-size: 18px; font-weight: 650; }
      .orientation-overlay p { margin: 0; font-size: 14px; color: #444; }
      body.orientation-blocked { overflow: hidden; }
      @media (prefers-color-scheme: dark){
        .orientation-overlay { background: #0f1115; color:#eaeaea }
        .orientation-overlay p { color:#c7c7c7 }
      }
    `;
    const style = document.createElement('style');
    style.id = 'orientation-lock-style';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  function ensureOverlay() {
    if ($('#orientationOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'orientationOverlay';
    overlay.className = 'orientation-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-live', 'polite');
    overlay.innerHTML = `
      <div class="card">
        <h2 id="orientTitle"></h2>
        <p id="orientText"></p>
      </div>`;
    document.body.appendChild(overlay);
  }

  function refreshTexts() {
    const h2 = $('#orientTitle');
    const p  = $('#orientText');
    if (!h2 || !p) return;
    h2.textContent = tr('rotateToPortraitTitle', 'Поверните устройство');
    p.textContent  = tr('rotateToPortraitText',  'Доступен только портретный режим. Пожалуйста, используйте приложение вертикально.');
  }

  function showOverlay(show) {
    const el = $('#orientationOverlay');
    if (!el) return;
    el.style.display = show ? 'flex' : 'none';
    document.body.classList.toggle('orientation-blocked', !!show);
    if (show) refreshTexts();
  }

  function isLandscape() {
    const mql = window.matchMedia && window.matchMedia('(orientation: landscape)');
    return (mql && mql.matches) || (window.innerWidth > window.innerHeight);
  }

  async function tryLock() {
    if (isIOS) return; // iOS doesn't allow locking
    const api = screen.orientation && screen.orientation.lock;
    if (!api) return;
    try { await screen.orientation.lock('portrait'); } catch (e) { /* ignore */ }
  }

  function update() {
    const land = isLandscape();
    showOverlay(land);
    if (!land) tryLock();
  }

  // --- wire language change signals broadly ---
  function wireI18N() {
    // 1) our canonical custom event (already used in the app sometimes)
    document.addEventListener('i18n:lang-changed', refreshTexts, false);
    // 2) alternative names that projects often use
    document.addEventListener('lang:changed', refreshTexts, false);
    document.addEventListener('ui:lang-changed', refreshTexts, false);
    window.addEventListener('languagechange', refreshTexts, false); // browser-level
    
    // 3) if app exposes setUiLang, wrap it to also refresh
    if (typeof window.setUiLang === 'function' && !window.setUiLang.__wrapped_for_orient__) {
      const orig = window.setUiLang;
      window.setUiLang = function () {
        const r = orig.apply(this, arguments);
        try {
          // dispatch a normalized event too
          document.dispatchEvent(new CustomEvent('i18n:lang-changed'));
        } catch(e){}
        refreshTexts();
        return r;
      };
      window.setUiLang.__wrapped_for_orient__ = true;
    }

    // 4) observe changes to <html lang="..">
    const htmlEl = document.documentElement;
    const mo = new MutationObserver((muts)=>{
      for (const m of muts) {
        if (m.type === 'attributes' && m.attributeName === 'lang') {
          refreshTexts();
          break;
        }
      }
    });
    mo.observe(htmlEl, { attributes: true });
  }

  // Init
  document.addEventListener('DOMContentLoaded', () => {
    ensureStyles();
    ensureOverlay();
    wireI18N();
    refreshTexts();
    update();
  });

  // Respond to orientation/resize/visibility
  window.addEventListener('orientationchange', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });

  // Retry lock on first user gesture (Chrome requirement)
  const once = () => { tryLock(); document.removeEventListener('click', once); document.removeEventListener('touchend', once); };
  document.addEventListener('click', once, { once: true });
  document.addEventListener('touchend', once, { once: true });

  // Expose manual refresh hook (if app wants to call)
  window.refreshOrientationTexts = refreshTexts;
})();
