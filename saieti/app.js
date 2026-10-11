// Category metadata (keys match GAMES)
const CATEGORIES = [
  { key: 'icebreakers',   lv: 'Icebreakers',     ru: 'Icebreakers' },
  { key: 'teambuilding',  lv: 'Komandas veidošana (Teambuilding)',         ru: 'Тимбилдинг' },
  { key: 'physical',      lv: 'Fiziskie energizers',        ru: 'Физические энерджайзеры' },
  { key: 'mental',        lv: 'Mentālie energizers',        ru: 'Ментальные энерджайзеры' },
  { key: 'creative',      lv: 'Radošās spēles',             ru: 'Креативные игры' },
  { key: 'brainstorm',    lv: 'Prāta vētra (Brainstorm)',   ru: 'Мозговой штурм (Brainstorm)' }
];

// UI strings
const STR = {
  lv: {
    pageTitle: 'Spēļu ģenerators',
    choose: 'Izvēlies kategoriju:',
    people: 'Dalībnieku skaits',
    duration: 'Ilgums',
    materials: 'Materiāli',
    back: '← Atpakaļ',
    reshuffle: '🔄 Jauna spēle',
    empty: 'Šajā kategorijā pagaidām nav spēļu.',
    inCategory: 'Kategorija: ',
    linkBrowse: '📋 Katalogs'
  },
  ru: {
    pageTitle: 'Генератор игр',
    choose: 'Выберите категорию:',
    people: 'Количество участников',
    duration: 'Длительность',
    materials: 'Материалы',
    back: '← Назад',
    reshuffle: '🔄 Новая игра',
    empty: 'В этой категории пока нет игр.',
    inCategory: 'Категория: ',
    linkBrowse: '📋 Каталог'
  }
};

let lang = 'lv';
let currentCategory = null;
let currentGameIndex = -1;

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
  document.getElementById('label-people').textContent = t('people');
  document.getElementById('label-duration').textContent = t('duration');
  document.getElementById('label-materials').textContent = t('materials');
  document.getElementById('btn-back').textContent = t('back');
  document.getElementById('btn-reshuffle').textContent = t('reshuffle');
  document.getElementById('empty-text').textContent = t('empty');
  document.getElementById('btn-empty-back').textContent = t('back');
  const linkBrowse = document.getElementById('link-browse');
  if (linkBrowse) linkBrowse.textContent = t('linkBrowse');
  document.getElementById('btn-lv').classList.toggle('active', lang === 'lv');
  document.getElementById('btn-ru').classList.toggle('active', lang === 'ru');
  document.documentElement.lang = lang;
  renderCategories();
  if (currentCategory && currentGameIndex >= 0) {
    showGame(GAMES[currentCategory][currentGameIndex], false);
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
          <small class="text-muted">${count} ${lang === 'ru' ? 'игр' : 'spēles'}</small>
        </div>
      </div>`;
    col.querySelector('.category-card').addEventListener('click', () => selectCategory(cat.key));
    grid.appendChild(col);
  });
}

function selectCategory(key) {
  currentCategory = key;
  const list = GAMES[key] || [];
  document.getElementById('category-view').classList.add('d-none');
  document.getElementById('game-view').classList.add('d-none');
  document.getElementById('empty-view').classList.add('d-none');

  if (list.length === 0) {
    document.getElementById('empty-view').classList.remove('d-none');
    return;
  }
  pickRandomGame();
  document.getElementById('game-view').classList.remove('d-none');
}

function pickRandomGame() {
  const list = GAMES[currentCategory];
  if (!list || list.length === 0) return;
  let idx;
  do {
    idx = Math.floor(Math.random() * list.length);
  } while (list.length > 1 && idx === currentGameIndex);
  currentGameIndex = idx;
  showGame(list[idx], true);
}

function showGame(game, updateLabel) {
  document.getElementById('game-title').textContent = splitTitle(game.title);
  document.getElementById('game-people').textContent = game.people || '—';
  document.getElementById('game-duration').textContent = game.duration || '—';
  document.getElementById('game-materials').textContent = game.materials || '—';
  document.getElementById('game-desc').textContent = (lang === 'ru' ? game.desc_ru : game.desc_lv) || '—';
  if (updateLabel) {
    const cat = CATEGORIES.find(c => c.key === currentCategory);
    document.getElementById('category-label').textContent =
      t('inCategory') + (lang === 'ru' ? cat.ru : cat.lv);
  }
}

function goBack() {
  currentCategory = null;
  currentGameIndex = -1;
  document.getElementById('game-view').classList.add('d-none');
  document.getElementById('empty-view').classList.add('d-none');
  document.getElementById('category-view').classList.remove('d-none');
}

// Event listeners
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    lang = btn.dataset.lang;
    applyLanguage();
  });
});
document.getElementById('btn-back').addEventListener('click', goBack);
document.getElementById('btn-empty-back').addEventListener('click', goBack);
document.getElementById('btn-reshuffle').addEventListener('click', pickRandomGame);

// Init
applyLanguage();
