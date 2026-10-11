// Category metadata (keys match GAMES) – same as app.js
const CATEGORIES = [
  { key: 'icebreakers',   lv: 'Ledlauži (Icebreakers)',     ru: 'Ледоколы (Icebreakers)' },
  { key: 'teambuilding',  lv: 'Komandas veidošana',         ru: 'Тимбилдинг' },
  { key: 'physical',      lv: 'Fiziskie energizers',        ru: 'Физические энерджайзеры' },
  { key: 'mental',        lv: 'Mentālie energizers',        ru: 'Ментальные энерджайзеры' },
  { key: 'creative',      lv: 'Radošās spēles',             ru: 'Креативные игры' },
  { key: 'brainstorm',    lv: 'Prāta vētra (Brainstorm)',   ru: 'Мозговой штурм (Brainstorm)' }
];

// UI strings
const STR = {
  lv: {
    pageTitle: 'Spēļu katalogs',
    choose: 'Izvēlies kategoriju:',
    people: 'Dalībnieku skaits',
    duration: 'Ilgums',
    materials: 'Materiāli',
    back: '← Atpakaļ',
    games: 'spēles',
    empty: 'Šajā kategorijā pagaidām nav spēļu.',
    linkRandom: '🎲 Ģenerators',
    countLabel: 'spēles šajā kategorijā'
  },
  ru: {
    pageTitle: 'Каталог игр',
    choose: 'Выберите категорию:',
    people: 'Количество участников',
    duration: 'Длительность',
    materials: 'Материалы',
    back: '← Назад',
    games: 'игр',
    empty: 'В этой категории пока нет игр.',
    linkRandom: '🎲 Генератор',
    countLabel: 'игр в этой категории'
  }
};

let lang = 'lv';
let currentCategory = null;

function t(key) {
  return STR[lang][key] || key;
}

function splitTitle(title) {
  const parts = title.split(' / ');
  if (lang === 'ru' && parts.length > 1) return parts[1].trim();
  return parts[0].trim();
}

function applyLanguage() {
  document.getElementById('page-title').textContent = t('pageTitle');
  document.getElementById('choose-text').textContent = t('choose');
  document.getElementById('btn-back').textContent = t('back');
  document.getElementById('link-random').textContent = t('linkRandom');
  document.getElementById('btn-lv').classList.toggle('active', lang === 'lv');
  document.getElementById('btn-ru').classList.toggle('active', lang === 'ru');
  document.documentElement.lang = lang;
  renderCategories();
  if (currentCategory) {
    showList(currentCategory);
  }
}

function renderCategories() {
  const grid = document.getElementById('category-grid');
  grid.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const count = (GAMES[cat.key] || []).length;
    const col = document.createElement('div');
    col.className = 'col-6 col-md-4 col-lg-3';
    col.innerHTML = `
      <div class="card category-card h-100" data-key="${cat.key}">
        <div class="card-body">
          <h5 class="card-title mb-1">${lang === 'ru' ? cat.ru : cat.lv}</h5>
          <small class="text-muted">${count} ${t('games')}</small>
        </div>
      </div>`;
    col.querySelector('.category-card').addEventListener('click', () => selectCategory(cat.key));
    grid.appendChild(col);
  });
}

function selectCategory(key) {
  currentCategory = key;
  document.getElementById('category-view').classList.add('d-none');
  document.getElementById('list-view').classList.remove('d-none');
  showList(key);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showList(key) {
  const list = GAMES[key] || [];
  const cat = CATEGORIES.find(c => c.key === key);
  const catName = lang === 'ru' ? cat.ru : cat.lv;

  document.getElementById('list-category-title').textContent = catName;
  document.getElementById('list-count').textContent =
    list.length === 0
      ? t('empty')
      : `${list.length} ${t('countLabel')}`;

  const container = document.getElementById('games-list');
  container.innerHTML = '';

  if (list.length === 0) {
    return;
  }

  list.forEach((game, index) => {
    const col = document.createElement('div');
    col.className = 'col-12';
    const desc = (lang === 'ru' ? game.desc_ru : game.desc_lv) || '—';
    col.innerHTML = `
      <div class="card shadow-sm game-card">
        <div class="card-body p-3 p-md-4">
          <h3 class="card-title h5 mb-3">${splitTitle(game.title)}</h3>
          <div class="meta-row">
            <div class="meta-item">
              <strong>${t('people')}</strong>
              <span>${game.people || '—'}</span>
            </div>
            <div class="meta-item">
              <strong>${t('duration')}</strong>
              <span>${game.duration || '—'}</span>
            </div>
            <div class="meta-item">
              <strong>${t('materials')}</strong>
              <span>${game.materials || '—'}</span>
            </div>
          </div>
          <hr class="my-3">
          <p class="card-text mb-0" style="white-space: pre-wrap;">${desc}</p>
        </div>
      </div>`;
    container.appendChild(col);
  });
}

function goBack() {
  currentCategory = null;
  document.getElementById('list-view').classList.add('d-none');
  document.getElementById('category-view').classList.remove('d-none');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Event listeners
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    lang = btn.dataset.lang;
    applyLanguage();
  });
});
document.getElementById('btn-back').addEventListener('click', goBack);

// Init
applyLanguage();
