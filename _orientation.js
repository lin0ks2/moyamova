
/*! orientation.js — temporary portrait-only enforcement for MOYAMOVA */
(function () {
  const isIOS = /iP(hone|od|ad)/.test(navigator.platform) || 
                (navigator.userAgent.includes("Mac") && "ontouchend" in document);
  const $ = (s, d=document) => d.querySelector(s);

  function t(key, fallback) {
    try {
      if (window.T) return window.T(key, fallback);
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
        <h2>${t('rotateToPortraitTitle', 'Поверните устройство')}</h2>
        <p>${t('rotateToPortraitText', 'Доступен только портретный режим. Пожалуйста, используйте приложение вертикально.')}</p>
      </div>`;
    document.body.appendChild(overlay);
  }

  function showOverlay(show) {
    const el = $('#orientationOverlay');
    if (!el) return;
    el.style.display = show ? 'flex' : 'none';
    document.body.classList.toggle('orientation-blocked', !!show);
  }

  function isLandscape() {
    const mql = window.matchMedia && window.matchMedia('(orientation: landscape)');
    return (mql && mql.matches) || (window.innerWidth > window.innerHeight);
  }

  async function tryLock() {
    // Screen Orientation API: supported on Android Chrome/PWA; not on iOS
    if (isIOS) return;
    const api = screen.orientation && screen.orientation.lock;
    if (!api) return;
    try {
      await screen.orientation.lock('portrait');
    } catch (e) {
      // Some contexts require user gesture; will retry on first interaction
    }
  }

  function update() {
    const land = isLandscape();
    showOverlay(land);
    // Try to lock again when we detect landscape (in case user unlocked)
    if (!land) tryLock();
  }

  // Init
  document.addEventListener('DOMContentLoaded', () => {
    ensureStyles();
    ensureOverlay();
    update();
    // Hook into your i18n runtime to refresh overlay on language change
    document.addEventListener('i18n:lang-changed', () => {
      const overlay = $('#orientationOverlay .card');
      if (overlay) {
        overlay.querySelector('h2').textContent = t('rotateToPortraitTitle', 'Поверните устройство');
        overlay.querySelector('p').textContent = t('rotateToPortraitText', 'Доступен только портретный режим. Пожалуйста, используйте приложение вертикально.');
      }
    }, false);
  });

  // Respond to changes
  window.addEventListener('orientationchange', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });

  // Retry lock on first user gesture (Chrome requirement)
  const once = () => { tryLock(); document.removeEventListener('click', once); document.removeEventListener('touchend', once); };
  document.addEventListener('click', once, { once: true });
  document.addEventListener('touchend', once, { once: true });
})();
