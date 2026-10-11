// Generator

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

let lang = getSavedLang();
let currentCategory = null;
let currentGameIndex = -1;
/** Recent indices per category to avoid immediate repeats */
const recentByCategory = {};

function t(key) {
  return STR[lang][key] || key;
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
  setActiveLangButtons(lang);
  renderCategoryGrid({
    hideEmpty: true,
    lang,
    onSelect: selectCategory
  });
  if (currentCategory && currentGameIndex >= 0) {
    const list = GAMES[currentCategory] || [];
    if (list[currentGameIndex]) showGame(list[currentGameIndex], false);
  }
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
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function pickRandomGame() {
  const list = GAMES[currentCategory];
  if (!list || list.length === 0) return;

  const recent = recentByCategory[currentCategory] || [];
  const avoid = new Set(recent);
  // Always avoid the currently shown game when possible
  if (currentGameIndex >= 0) avoid.add(currentGameIndex);

  let candidates = list.map((_, i) => i).filter(i => !avoid.has(i));
  if (candidates.length === 0) {
    // All recent — clear history except current
    candidates = list.map((_, i) => i).filter(i => i !== currentGameIndex);
    if (candidates.length === 0) candidates = list.map((_, i) => i);
    recentByCategory[currentCategory] = [];
  }

  const idx = candidates[Math.floor(Math.random() * candidates.length)];
  currentGameIndex = idx;

  // Keep last ~min(5, n-1) recent indices
  const maxRecent = Math.min(5, Math.max(1, list.length - 1));
  const nextRecent = [...(recentByCategory[currentCategory] || []), idx].slice(-maxRecent);
  recentByCategory[currentCategory] = nextRecent;

  showGame(list[idx], true);
}

function showGame(game, updateLabel) {
  const title = splitTitle(game.title, lang);
  document.getElementById('game-title').textContent = title;
  document.getElementById('game-people').textContent = game.people || '—';
  document.getElementById('game-duration').textContent = game.duration || '—';
  document.getElementById('game-materials').textContent = game.materials || '—';
  document.getElementById('game-desc').textContent = (lang === 'ru' ? game.desc_ru : game.desc_lv) || '—';
  fillGameImages(document.getElementById('game-images'), game, { alt: title });
  if (updateLabel) {
    const cat = CATEGORIES.find(c => c.key === currentCategory);
    document.getElementById('category-label').textContent =
      t('inCategory') + categoryName(cat, lang);
  }
}

function goBack() {
  currentCategory = null;
  currentGameIndex = -1;
  document.getElementById('game-view').classList.add('d-none');
  document.getElementById('empty-view').classList.add('d-none');
  document.getElementById('category-view').classList.remove('d-none');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Event listeners
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    lang = btn.dataset.lang;
    saveLang(lang);
    applyLanguage();
  });
});
document.getElementById('btn-back').addEventListener('click', goBack);
document.getElementById('btn-empty-back').addEventListener('click', goBack);
document.getElementById('btn-reshuffle').addEventListener('click', pickRandomGame);

// Keyboard: R for reshuffle when game is visible
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  if ((e.key === 'r' || e.key === 'R') && !document.getElementById('game-view').classList.contains('d-none')) {
    pickRandomGame();
  }
});

// Init
applyLanguage();
