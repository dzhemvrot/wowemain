// Shared constants

const CATEGORIES = [
  { key: 'icebreakers',  lv: 'Icebreakers',                        ru: 'Icebreakers' },
  { key: 'teambuilding', lv: 'Komandas veidošana (Teambuilding)',  ru: 'Тимбилдинг' },
  { key: 'physical',     lv: 'Fiziskie energizers',                ru: 'Физические энерджайзеры' },
  { key: 'mental',       lv: 'Mentālie energizers',                ru: 'Ментальные энерджайзеры' },
  { key: 'creative',     lv: 'Radošās spēles',                     ru: 'Креативные игры' },
  { key: 'brainstorm',   lv: 'Prāta vētra (Brainstorm)',           ru: 'Мозговой штурм (Brainstorm)' }
];

const LANG_KEY = 'saieti-lang';

function getSavedLang() {
  const saved = localStorage.getItem(LANG_KEY);
  return (saved === 'lv' || saved === 'ru') ? saved : 'lv';
}

function saveLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
}

function splitTitle(title, lang) {
  const parts = (title || '').split(' / ');
  if (lang === 'ru' && parts.length > 1) return parts[1].trim();
  return parts[0].trim();
}

function categoryName(cat, lang) {
  return lang === 'ru' ? cat.ru : cat.lv;
}

function gameCountLabel(count, lang) {
  if (lang === 'ru') {
    // Russian plural
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return count + ' игра';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return count + ' игры';
    return count + ' игр';
  }
  return count + (count === 1 ? ' spēle' : ' spēles');
}

/** Render category cards into #category-grid. Options: { hideEmpty, onSelect, lang, extraClass } */
function renderCategoryGrid(options) {
  const { hideEmpty = true, onSelect, lang, gamesMap } = options;
  const grid = document.getElementById('category-grid');
  if (!grid) return;
  grid.innerHTML = '';

  CATEGORIES.forEach(cat => {
    const list = (gamesMap || GAMES)[cat.key] || [];
    const count = list.length;
    if (hideEmpty && count === 0) return;

    const col = document.createElement('div');
    col.className = 'col-6 col-md-4 col-lg-3';
    col.innerHTML = `
      <div class="card category-card h-100" data-key="${cat.key}" role="button" tabindex="0"
           aria-label="${categoryName(cat, lang)}">
        <div class="card-body">
          <h5 class="card-title mb-1">${categoryName(cat, lang)}</h5>
          <small class="text-muted">${gameCountLabel(count, lang)}</small>
        </div>
      </div>`;
    const card = col.querySelector('.category-card');
    card.addEventListener('click', () => onSelect && onSelect(cat.key));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect && onSelect(cat.key);
      }
    });
    grid.appendChild(col);
  });
}

function setActiveLangButtons(lang) {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
    btn.setAttribute('aria-pressed', btn.dataset.lang === lang ? 'true' : 'false');
  });
  document.documentElement.lang = lang;
}
