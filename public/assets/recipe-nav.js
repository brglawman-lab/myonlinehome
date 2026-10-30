/* Recipe book navigation — the row of big buttons under the header on
 * /recipes/ and its sub-pages (Meal Builder, Jodie, Food Storage, Cocktail
 * Menu, Bar Stock). Benicity Cloake moved to /admin/benicity/ (signed in only)
 * and is deliberately not listed here.
 *
 * Every page loads this one file, so the buttons are the same everywhere:
 * add or rename a destination here, not in the pages.
 *
 * Usage: <nav class="recipe-nav" id="recipeNav" data-current="storage"></nav>
 *        <script src="/assets/recipe-nav.js"></script>
 * The script must come straight after the <nav> so the buttons are drawn
 * before first paint. The colours come from each page's own CSS variables.
 *
 * Drinks, Seasonal and Foraging are tabs inside /recipes/. From another page
 * they link to /recipes/#drinks etc.; on /recipes/ itself a click calls the
 * page's switchToPage() instead of reloading. */
(function () {
  const svg = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const ITEMS = [
    { id: 'recipes',    label: 'Recipes',      href: '/recipes/',            tab: true,
      icon: svg('<path d="M12 6.5C10.2 5 7.6 4.5 4 4.5v13c3.6 0 6.2.5 8 2 1.8-1.5 4.4-2 8-2v-13c-3.6 0-6.2.5-8 2Z"/><path d="M12 6.5v13"/>') },
    { id: 'inspiration', label: 'Inspiration', href: '/recipes/inspiration/',
      icon: svg('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3Z"/>') },
    { id: 'drinks',     label: 'Drinks',       href: '/recipes/#drinks',     tab: true,
      icon: svg('<path d="M5 4h14l-7 8z"/><path d="M12 12v7"/><path d="M8 20h8"/>') },
    { id: 'menu',       label: 'Cocktail Menu', href: '/recipes/cocktail-menu/',
      icon: svg('<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h4"/>') },
    { id: 'barstock',   label: 'Bar Stock',    href: '/recipes/bar-stock/',
      icon: svg('<path d="M10 2h4v4l1.5 2.5V21a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V8.5L10 6z"/><path d="M8.5 13h7"/>') },
    { id: 'seasonal',   label: 'Seasonal',     href: '/recipes/#seasonal',   tab: true,
      icon: svg('<path d="M5 19c0-8 5-14 14-14 0 9-6 14-14 14Z"/><path d="M5 19 13 11"/>') },
    { id: 'foraging',   label: 'Foraging',     href: '/recipes/#foraging',   tab: true,
      icon: svg('<path d="M4 12a8 5 0 0 1 16 0Z"/><path d="M10 12v6a2 2 0 0 0 4 0v-6"/>') },
    { id: 'combinator', label: 'Meal Builder', href: '/recipes/combinator/',
      icon: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>') },
    { id: 'jodie',      label: 'What does Jodie want?', href: '/recipes/jodie/',
      icon: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.2-2.5 3.9"/><path d="M12 17h.01"/>') },
    { id: 'storage',    label: 'Food Storage', href: '/recipes/storage/',
      icon: svg('<path d="M4 4h16v4H4z"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M9 12h6"/>') },
    { id: 'dashboard',  label: 'Dashboard',    href: '/dashboard/',
      icon: svg('<rect x="3" y="3" width="8" height="10" rx="1.5"/><rect x="13" y="3" width="8" height="6" rx="1.5"/><rect x="13" y="11" width="8" height="10" rx="1.5"/><rect x="3" y="15" width="8" height="6" rx="1.5"/>') },
  ];

  const css = `
  .recipe-nav { background: var(--bg); border-bottom: 1px solid var(--border); padding: 14px 2rem; }
  .recipe-nav-inner { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: repeat(${ITEMS.length}, minmax(0, 1fr)); gap: 10px; }
  .recipe-nav a { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; min-height: 84px; padding: 12px 6px; text-align: center; text-decoration: none; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-lg); font-family: 'DM Sans', sans-serif; font-size: 13.5px; font-weight: 500; line-height: 1.2; transition: background 0.15s, border-color 0.15s, transform 0.15s, box-shadow 0.15s; }
  .recipe-nav a svg { width: 26px; height: 26px; color: var(--accent); flex-shrink: 0; }
  .recipe-nav a:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(20,16,12,0.08); border-color: var(--accent); }
  .recipe-nav a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .recipe-nav a.active { background: var(--accent); border-color: var(--accent); color: #fff; }
  .recipe-nav a.active svg { color: #fff; }
  @media (max-width: 1000px) {
    .recipe-nav-inner { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  }
  @media (max-width: 720px) {
    .recipe-nav { padding: 10px 1rem; }
    .recipe-nav-inner { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
    .recipe-nav a { min-height: 68px; padding: 8px 4px; font-size: 12px; gap: 5px; }
    .recipe-nav a svg { width: 22px; height: 22px; }
  }
  @media print { .recipe-nav { display: none; } }`;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const nav = document.getElementById('recipeNav');
  if (!nav) return;
  nav.setAttribute('aria-label', 'Recipe book');
  nav.innerHTML = '<div class="recipe-nav-inner">' + ITEMS.map(it =>
    '<a href="' + it.href + '" data-id="' + it.id + '"' + (it.tab ? ' data-tab="1"' : '') + '>' + it.icon + '<span>' + it.label + '</span></a>'
  ).join('') + '</div>';

  function setCurrent(id) {
    nav.querySelectorAll('a').forEach(a => {
      const on = a.dataset.id === id;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  setCurrent(nav.dataset.current);
  window.setRecipeNavCurrent = setCurrent;

  // On /recipes/ the tab buttons switch in place rather than reloading.
  nav.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-tab]');
    if (!a || typeof window.switchToPage !== 'function') return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    history.replaceState(null, '', a.getAttribute('href'));
    window.switchToPage(a.dataset.id);
  });
})();
