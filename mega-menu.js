// ---------- 0. CSS in den Head injizieren ----------
(function injectStyles() {
  if (document.getElementById('bsh-megamenu-styles')) return;
  var css = [
    /* Base-UI-Submenü unterdrücken */
    '[data-base-ui-portal] [data-base-ui-navigation-menu-trigger],',
    '[data-base-ui-portal] > div > div[data-open] {',
    '  display: none !important;',
    '}',
    '.nav-backdrop { background-color: transparent !important; }',

    /* Mega-Menü-Overlay */
    '#bsh-megamenu {',
    '  position: fixed;',
    '  left: 0; right: 0;',
    '  top: 84px;',
    '  z-index: 9;',
    '  background: #ececec;',
    '  color: #111;',
    '  box-shadow: 0 6px 16px rgba(0,0,0,0.12);',
    '  padding: 24px 48px;',
    '  display: none;',
    '}',
    '#bsh-megamenu.open { display: block; }',

    '#bsh-megamenu .bsh-mm-grid {',
    '  display: grid;',
    '  grid-template-columns: repeat(4, 1fr);',
    '  gap: 24px 48px;',
    '  max-width: 1332px;',
    '  margin: 0 auto;',
    '}',
    '#bsh-megamenu .bsh-mm-col h3 {',
    '  font-size: 16px;',
    '  font-weight: 700;',
    '  margin: 0 0 12px;',
    '  color: #111;',
    '}',
    '#bsh-megamenu .bsh-mm-col h3 a {',
    '  color: inherit; text-decoration: none;',
    '}',
    '#bsh-megamenu .bsh-mm-col ul {',
    '  list-style: none; margin: 0; padding: 0;',
    '}',
    '#bsh-megamenu .bsh-mm-col li { margin: 6px 0; }',
    '#bsh-megamenu .bsh-mm-col a {',
    '  color: #222; text-decoration: none; font-size: 14px;',
    '}',
    '#bsh-megamenu .bsh-mm-col a:hover { text-decoration: underline; }'
  ].join('\n');

  var style = document.createElement('style');
  style.id = 'bsh-megamenu-styles';
  style.textContent = css;
  document.head.appendChild(style);
})();
