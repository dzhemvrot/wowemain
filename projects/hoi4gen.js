// ====================== HOI4 Country & News Generator v2.7 ======================
// Improvement: Character gen

let currentTab = 0;
let newsOptions = [
    { name: "event.1.a", effect: "add_stability = 0.10" },
    { name: "event.1.b", effect: "add_political_power = 50" }
];

let lastCountryData = null;
let lastNewsData = null;
let liveTimeout = null;

// Country pools...
const COUNTRY_NAME_POOL = ["Aether Republic", "Zorath Empire", "Luminar Federation", "Vortex Dominion", "Kaleidos Union", "Synapse Collective", "Nexus Realm", "Phoenix Kingdom", "Orion Alliance", "Elysium State"];
const COUNTRY_ADJ_POOL = ["Aetherian", "Zorathi", "Luminari", "Vortixian", "Kaleidian", "Synaptic", "Nexian", "Phoenician", "Orionic", "Elysian"];
const COUNTRY_TAG_POOL = ["AET", "ZOR", "LUM", "VOR", "KAL", "SYN", "NEX", "PHO", "ORA", "ELY"];

// ====================== TAB SYSTEM ======================
function switchTab(tab) {
    currentTab = tab;

    // Deactivate all tabs
    for (let i = 0; i <= 3; i++) {
        const tabEl = document.getElementById('tab-' + i);
        if (tabEl) tabEl.classList.toggle('tab-active', i === tab);
    }

    // Show only the selected panel
    document.getElementById('panel-0').classList.toggle('hidden', tab !== 0);
    document.getElementById('panel-1').classList.toggle('hidden', tab !== 1);
    document.getElementById('panel-2').classList.toggle('hidden', tab !== 2);
    document.getElementById('panel-3').classList.toggle('hidden', tab !== 3);
}

// ====================== PARTY POPULARITY ======================
function getPartyValues() {
    return {
        democratic: Math.max(0, parseInt(document.getElementById('pop-democratic')?.value) || 0),
        fascist: Math.max(0, parseInt(document.getElementById('pop-fascist')?.value) || 0),
        communism: Math.max(0, parseInt(document.getElementById('pop-communism')?.value) || 0),
        neutrality: Math.max(0, parseInt(document.getElementById('pop-neutrality')?.value) || 0)
    };
}

function setPartyValues(vals) {
    ['democratic','fascist','communism','neutrality'].forEach(p => {
        const el = document.getElementById(`pop-${p}`);
        const num = document.getElementById(`pop-${p}-num`);
        if (el) el.value = vals[p];
        if (num) num.value = vals[p];
    });
}

function normalizeParties() {
    let vals = getPartyValues();
    let total = Object.values(vals).reduce((a,b)=>a+b,0);

    if (total === 0) {
        setPartyValues({ democratic: 45, fascist: 15, communism: 10, neutrality: 30 });
        return;
    }

    if (total !== 100) {
        const factor = 100 / total;
        vals.democratic = Math.max(0, Math.round(vals.democratic * factor));
        vals.fascist = Math.max(0, Math.round(vals.fascist * factor));
        vals.communism = Math.max(0, Math.round(vals.communism * factor));
        vals.neutrality = 100 - (vals.democratic + vals.fascist + vals.communism);
    }
    setPartyValues(vals);
}

// ====================== COUNTRY GENERATOR ======================
function generateCountry() {
    const tag = (document.getElementById('country-tag')?.value || 'NEW').toUpperCase().trim();
    if (tag.length !== 3 || !/^[A-Z]{3}$/.test(tag)) return;

    const baseName = document.getElementById('country-name')?.value.trim() || 'New Republic';
    const adjective = document.getElementById('country-adjective')?.value.trim() || 'New';
    const capital = document.getElementById('country-capital')?.value.trim() || '1';
    const culture = document.getElementById('country-culture')?.value || 'western_european';
    let colorInput = document.getElementById('country-color')?.value.trim() || '50, 100, 200';

    const rulingParty = document.getElementById('ruling-party')?.value || 'neutrality';
    const electionsAllowed = document.getElementById('elections-allowed')?.checked ? 'yes' : 'no';
    const electionFreq = parseInt(document.getElementById('election-frequency')?.value) || 48;
    const lastElection = document.getElementById('last-election')?.value || '1936.1.1';

    const researchSlots = parseInt(document.getElementById('research-slots')?.value) || 2;
    const stability = parseFloat(document.getElementById('starting-stability')?.value) || 0.60;
    const warSupport = parseFloat(document.getElementById('starting-warsupport')?.value) || 0.20;

    // === Ideology-specific names ===
    const nameDem = document.getElementById('name-democratic')?.value.trim() || baseName;
    const nameFas = document.getElementById('name-fascist')?.value.trim() || `Fascist ${baseName}`;
    const nameCom = document.getElementById('name-communism')?.value.trim() || `People's ${baseName}`;
    const nameNeu = document.getElementById('name-neutrality')?.value.trim() || baseName;

    let { democratic: dem, fascist: fas, communism: com, neutrality: neu } = getPartyValues();

    let colorBlock = colorInput.includes('{') ? `color = ${colorInput}` : `color = rgb { ${colorInput} }`;

    const commonTxt = `graphical_culture = ${culture}\n` +
                     `graphical_culture_2d = ${culture.replace('_gfx','_2d') || culture + '_2d'}\n\n` +
                     `${colorBlock}\n`;

    let historyTxt = `capital = ${capital}\n\n` +
                    `oob = "${tag}_1936"\n\n` +
                    `set_research_slots = ${researchSlots}\n\n` +
                    `set_politics = {\n` +
                    `    ruling_party = ${rulingParty}\n` +
                    `    last_election = "${lastElection}"\n` +
                    `    election_frequency = ${electionFreq}\n` +
                    `    elections_allowed = ${electionsAllowed}\n` +
                    `}\n\n` +
                    `set_popularities = {\n` +
                    `    democratic    = ${dem}\n` +
                    `    fascist       = ${fas}\n` +
                    `    communism     = ${com}\n` +
                    `    neutrality    = ${neu}\n` +
                    `}\n\n` +
                    `set_stability = ${stability.toFixed(2)}\n` +
                    `set_war_support = ${warSupport.toFixed(2)}\n\n` +
                    `# Starting laws\n` +
                    `add_ideas = {\n` +
                    `    civilian_economy\n` +
                    `    export_focus\n` +
                    `    volunteer_only\n` +
                    `}\n\n`;

    const locTxt = `l_english:\n` +
                  ` ${tag}:0 "${baseName}"\n` +
                  ` ${tag}_DEF:0 "${baseName}"\n` +
                  ` ${tag}_ADJ:0 "${adjective}"\n\n` +
                  ` ${tag}_democratic:0 "${nameDem}"\n` +
                  ` ${tag}_fascist:0 "${nameFas}"\n` +
                  ` ${tag}_communism:0 "${nameCom}"\n` +
                  ` ${tag}_neutrality:0 "${nameNeu}"\n\n` +
                  ` ${tag}_democratic_party:0 "${document.getElementById('party-dem-name')?.value || 'Democratic Party'}"\n` +
                  ` ${tag}_fascist_party:0 "${document.getElementById('party-fas-name')?.value || 'National Front'}"\n` +
                  ` ${tag}_communism_party:0 "${document.getElementById('party-com-name')?.value || 'Communist Party'}"\n` +
                  ` ${tag}_neutrality_party:0 "${document.getElementById('party-neu-name')?.value || 'Non-Aligned Movement'}"\n`;

    const preview = `# =======================\n` +
                   `# 1. common/country_tags/${tag}.txt\n` +
                   `# =======================\n` +
                   `${tag} = "countries/${tag}.txt"\n\n` +
                   `# =======================\n` +
                   `# 2. common/countries/${tag}.txt\n` +
                   `# =======================\n${commonTxt}\n\n` +
                   `# =======================\n` +
                   `# 3. history/countries/${tag} - ${baseName}.txt\n` +
                   `# =======================\n${historyTxt}\n\n` +
                   `# =======================\n` +
                   `# 4. localisation/english/${tag}_l_english.yml\n` +
                   `# =======================\n${locTxt}\n\n` +
                   `# NEXT STEPS: flags, OOB, states, characters...`;

    document.getElementById('country-preview').textContent = preview;
    document.getElementById('preview-tag').textContent = tag;
    document.getElementById('preview-tag2').textContent = `${tag} - ${baseName}`;
    document.getElementById('preview-tag3').textContent = tag;

    const total = dem + fas + com + neu;
    const totalEl = document.getElementById('pop-total');
    if (totalEl) {
        totalEl.textContent = total;
        totalEl.style.color = total === 100 ? '#00ff9d' : '#ff6666';
    }

    lastCountryData = { tag, name: baseName, files: { tagfile: `${tag} = "countries/${tag}.txt"`, common: commonTxt, history: historyTxt, localisation: locTxt } };
}

// Live update
function liveUpdate() {
    clearTimeout(liveTimeout);
    liveTimeout = setTimeout(() => {
        normalizeParties();
        generateCountry();
    }, 10);
}

function setRulingToHighest() {
    let vals = getPartyValues();
    let max = Math.max(vals.democratic, vals.fascist, vals.communism, vals.neutrality);
    let ruling = Object.keys(vals).find(key => vals[key] === max) || 'neutrality';
    document.getElementById('ruling-party').value = ruling;
    generateCountry();
}

function randomizeCountry() {
    const idx = Math.floor(Math.random() * COUNTRY_NAME_POOL.length);
    
    document.getElementById('country-tag').value = COUNTRY_TAG_POOL[idx];
    document.getElementById('country-name').value = COUNTRY_NAME_POOL[idx];
    document.getElementById('country-adjective').value = COUNTRY_ADJ_POOL[idx];
    document.getElementById('country-capital').value = String(100 + Math.floor(Math.random() * 900));
    document.getElementById('country-culture').value = ["western_european","eastern_european","american","asian","african"][Math.floor(Math.random()*5)];
    document.getElementById('country-color').value = `${Math.floor(Math.random()*256)}, ${Math.floor(Math.random()*256)}, ${Math.floor(Math.random()*256)}`;

    document.getElementById('research-slots').value = Math.random() > 0.6 ? 3 : 2;
    document.getElementById('starting-stability').value = (0.4 + Math.random() * 0.5).toFixed(2);
    document.getElementById('starting-warsupport').value = (0.1 + Math.random() * 0.4).toFixed(2);

    let dem = 35 + Math.floor(Math.random() * 35);
    let neu = 25 + Math.floor(Math.random() * 30);
    let fas = Math.floor(Math.random() * 20);
    let com = 100 - dem - neu - fas; if (com < 0) com = 0;
    setPartyValues({ democratic: dem, fascist: fas, communism: com, neutrality: neu });

    const parties = ['democratic','fascist','communism','neutrality'];
    document.getElementById('ruling-party').value = parties[Math.floor(Math.random()*4)];
    document.getElementById('elections-allowed').checked = Math.random() > 0.3;
    document.getElementById('election-frequency').value = [24, 48, 60][Math.floor(Math.random()*3)];
    document.getElementById('last-election').value = `193${Math.floor(Math.random()*7)}.1.1`;

    // Random ideology names
    document.getElementById('name-democratic').value = COUNTRY_NAME_POOL[idx];
    document.getElementById('name-fascist').value = `Greater ${COUNTRY_NAME_POOL[idx]}`;
    document.getElementById('name-communism').value = `People's Republic of ${COUNTRY_NAME_POOL[idx].split(' ')[0]}`;
    document.getElementById('name-neutrality').value = COUNTRY_NAME_POOL[idx];

    generateCountry();
}

// ====================== RENDER COUNTRY FORM ======================
function renderCountryForm() {
    const container = document.getElementById('country-form');
    container.innerHTML = `
        <div class="space-y-8">

            <!-- Basic Information -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="input-label block mb-1">COUNTRY TAG (3 letters)</label>
                    <input id="country-tag" type="text" maxlength="3" value="NEW" 
                           class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" oninput="liveUpdate()">
                </div>
                <div>
                    <label class="input-label block mb-1">BASE NAME</label>
                    <input id="country-name" type="text" value="New Republic" 
                           class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" oninput="liveUpdate()">
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label class="input-label block mb-1">ADJECTIVE</label>
                    <input id="country-adjective" type="text" value="New" 
                           class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" oninput="liveUpdate()">
                </div>
                <div>
                    <label class="input-label block mb-1">CAPITAL STATE ID</label>
                    <input id="country-capital" type="text" value="1" 
                           class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" oninput="liveUpdate()">
                </div>
                <div>
                    <label class="input-label block mb-1">GRAPHICAL CULTURE</label>
                    <select id="country-culture" class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" onchange="liveUpdate()">
                        <option value="western_european">Western European</option>
                        <option value="eastern_european">Eastern European</option>
                        <option value="american" selected>American</option>
                        <option value="asian">Asian</option>
                        <option value="african">African</option>
                        <option value="commonwealth_gfx">Commonwealth</option>
                        <option value="germanic_gfx">Germanic</option>
                        <option value="latin_american">Latin American</option>
                        <option value="scandinavian_gfx">Scandinavian</option>
                        <option value="slavic_gfx">Slavic</option>
                    </select>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="input-label block mb-1">COLOR (R, G, B)</label>
                    <input id="country-color" type="text" value="50, 100, 200" 
                           class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" oninput="liveUpdate()">
                    <p class="text-xs text-gray-400 mt-1">e.g. 50, 100, 200  or  rgb { 50 100 200 }</p>
                </div>
                <div class="flex items-center gap-x-3 pt-6">
                    <input type="checkbox" id="country-major" checked class="w-5 h-5 accent-[#c8102e]" onchange="liveUpdate()">
                    <label for="country-major" class="text-lg">Major Nation</label>
                </div>
            </div>

            <!-- === IDEOLOGY-SPECIFIC COUNTRY NAMES === -->
            <div class="bg-black/60 p-6 rounded border border-[#c8102e]/70">
                <label class="input-label block mb-4 text-[#00ff9d] text-lg">IDEOLOGY-SPECIFIC COUNTRY NAMES</label>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-blue-400 text-sm mb-1 font-medium">Democratic Name</label>
                        <input id="name-democratic" type="text" value="New Republic" 
                               class="w-full bg-black border-2 border-blue-500 px-4 py-3 text-lg font-mono" oninput="liveUpdate()">
                    </div>
                    <div>
                        <label class="block text-red-400 text-sm mb-1 font-medium">Fascist Name</label>
                        <input id="name-fascist" type="text" value="Fascist New Republic" 
                               class="w-full bg-black border-2 border-red-500 px-4 py-3 text-lg font-mono" oninput="liveUpdate()">
                    </div>
                    <div>
                        <label class="block text-yellow-400 text-sm mb-1 font-medium">Communist Name</label>
                        <input id="name-communism" type="text" value="People's New Republic" 
                               class="w-full bg-black border-2 border-yellow-500 px-4 py-3 text-lg font-mono" oninput="liveUpdate()">
                    </div>
                    <div>
                        <label class="block text-gray-300 text-sm mb-1 font-medium">Neutrality Name</label>
                        <input id="name-neutrality" type="text" value="New Republic" 
                               class="w-full bg-black border-2 border-gray-400 px-4 py-3 text-lg font-mono" oninput="liveUpdate()">
                    </div>
                </div>
            </div>

            <!-- Politics Setup -->
            <div class="bg-black/50 p-6 rounded border border-[#c8102e]/50 space-y-6">
                <div class="flex justify-between items-baseline">
                    <label class="input-label">POLITICS SETUP</label>
                    <button onclick="setRulingToHighest()" 
                            class="px-4 py-1 text-xs bg-black border border-[#00ff9d] hover:bg-[#00ff9d] hover:text-black">
                        ↗ SET RULING TO HIGHEST
                    </button>
                </div>
                
                <div>
                    <label class="input-label block mb-2">RULING PARTY</label>
                    <select id="ruling-party" onchange="liveUpdate()" 
                            class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono">
                        <option value="democratic">Democratic</option>
                        <option value="fascist">Fascist</option>
                        <option value="communism">Communist</option>
                        <option value="neutrality" selected>Neutrality</option>
                    </select>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="input-label block mb-2">ELECTIONS ALLOWED</label>
                        <label class="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" id="elections-allowed" checked onchange="liveUpdate()" class="w-5 h-5 accent-[#c8102e]">
                            <span class="text-lg">Yes</span>
                        </label>
                    </div>
                    <div>
                        <label class="input-label block mb-1">ELECTION FREQUENCY (months)</label>
                        <input id="election-frequency" type="number" value="48" min="1" 
                               class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" oninput="liveUpdate()">
                    </div>
                </div>

                <div>
                    <label class="input-label block mb-1">LAST ELECTION (YYYY.M.D)</label>
                    <input id="last-election" type="text" value="1936.1.1" 
                           class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" oninput="liveUpdate()">
                </div>
            </div>

            <!-- Research & Starting Stats -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label class="input-label block mb-1">RESEARCH SLOTS</label>
                    <input id="research-slots" type="number" value="2" min="1" max="5" 
                           class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" oninput="liveUpdate()">
                </div>
                <div>
                    <label class="input-label block mb-1">STARTING STABILITY</label>
                    <input id="starting-stability" type="number" value="0.60" step="0.01" min="0" max="1" 
                           class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" oninput="liveUpdate()">
                </div>
                <div>
                    <label class="input-label block mb-1">STARTING WAR SUPPORT</label>
                    <input id="starting-warsupport" type="number" value="0.20" step="0.01" min="0" max="1" 
                           class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" oninput="liveUpdate()">
                </div>
            </div>

            <!-- Party Popularities -->
            <div>
                <div class="flex justify-between items-baseline mb-3">
                    <label class="input-label">PARTY POPULARITIES (must sum to 100)</label>
                    <span id="pop-total" class="font-mono text-2xl font-bold text-[#00ff9d]">100</span>
                </div>
                <div class="space-y-5">
                    <div class="flex items-center gap-4">
                        <span class="w-28 text-blue-400 font-medium">Democratic</span>
                        <input id="pop-democratic" type="range" min="0" max="100" value="45" 
                               class="flex-1 accent-blue-500" oninput="liveUpdate()">
                        <input id="pop-democratic-num" type="number" min="0" max="100" value="45" 
                               class="w-16 bg-black border border-[#c8102e] text-center font-mono" onchange="liveUpdate()">
                    </div>
                    <div class="flex items-center gap-4">
                        <span class="w-28 text-red-400 font-medium">Fascist</span>
                        <input id="pop-fascist" type="range" min="0" max="100" value="15" 
                               class="flex-1 accent-red-500" oninput="liveUpdate()">
                        <input id="pop-fascist-num" type="number" min="0" max="100" value="15" 
                               class="w-16 bg-black border border-[#c8102e] text-center font-mono" onchange="liveUpdate()">
                    </div>
                    <div class="flex items-center gap-4">
                        <span class="w-28 text-yellow-400 font-medium">Communist</span>
                        <input id="pop-communism" type="range" min="0" max="100" value="10" 
                               class="flex-1 accent-yellow-500" oninput="liveUpdate()">
                        <input id="pop-communism-num" type="number" min="0" max="100" value="10" 
                               class="w-16 bg-black border border-[#c8102e] text-center font-mono" onchange="liveUpdate()">
                    </div>
                    <div class="flex items-center gap-4">
                        <span class="w-28 text-gray-300 font-medium">Neutrality</span>
                        <input id="pop-neutrality" type="range" min="0" max="100" value="30" 
                               class="flex-1 accent-gray-400" oninput="liveUpdate()">
                        <input id="pop-neutrality-num" type="number" min="0" max="100" value="30" 
                               class="w-16 bg-black border border-[#c8102e] text-center font-mono" onchange="liveUpdate()">
                    </div>
                </div>
            </div>

            <!-- Custom Party Names -->
            <div>
                <label class="input-label block mb-3">CUSTOM PARTY NAMES (optional)</label>
                <div class="grid grid-cols-2 gap-4">
                    <input id="party-dem-name" type="text" value="Democratic Party" 
                           class="bg-black border border-[#c8102e] px-4 py-3" oninput="liveUpdate()">
                    <input id="party-fas-name" type="text" value="National Front" 
                           class="bg-black border border-[#c8102e] px-4 py-3" oninput="liveUpdate()">
                    <input id="party-com-name" type="text" value="Communist Party" 
                           class="bg-black border border-[#c8102e] px-4 py-3" oninput="liveUpdate()">
                    <input id="party-neu-name" type="text" value="Non-Aligned Movement" 
                           class="bg-black border border-[#c8102e] px-4 py-3" oninput="liveUpdate()">
                </div>
            </div>

            <!-- Action Buttons -->
            <div class="pt-4 border-t border-[#c8102e]/50 flex flex-col gap-3">
                <button onclick="randomizeCountry()" 
                        class="w-full py-5 bg-[#00ff9d] hover:bg-[#00cc7a] text-black text-2xl font-bold tracking-widest transition-all">
                    🎲 RANDOMIZE COUNTRY
                </button>
                <button onclick="generateCountry()" 
                        class="w-full py-5 bg-[#c8102e] hover:bg-[#a00d24] text-2xl font-bold tracking-widest transition-all">
                    GENERATE COUNTRY FILES →
                </button>
            </div>

        </div>
    `;
}

// ====================== NEWS EVENT GENERATOR ======================
function renderNewsForm() {
    const container = document.getElementById('news-form');
    container.innerHTML = `
        <div class="space-y-6">
            <div>
                <label class="input-label block mb-1">EVENT ID</label>
                <input id="news-id" type="text" value="news.1" 
                       class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono">
            </div>
            <div>
                <label class="input-label block mb-1">TITLE (localisation key)</label>
                <input id="news-title" type="text" value="event.1.t" 
                       class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono">
            </div>
            <div>
                <label class="input-label block mb-1">DESCRIPTION (localisation key)</label>
                <textarea id="news-desc" rows="3" 
                          class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono">event.1.d</textarea>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="input-label block mb-1">PICTURE</label>
                    <input id="news-picture" type="text" value="GFX_news_event_generic" 
                           class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono">
                </div>
                <div>
                    <label class="input-label block mb-1">TRIGGER COUNTRY TAG</label>
                    <input id="news-trigger" type="text" value="NEW" maxlength="3"
                           class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono">
                </div>
            </div>
            <div>
                <label class="input-label block mb-2">OPTIONS (1–3)</label>
                <div id="options-container" class="space-y-3"></div>
                <button onclick="addOption()" 
                        class="mt-3 px-6 py-2 border border-[#c8102e] text-[#c8102e] hover:bg-[#c8102e] hover:text-white transition-colors">
                    + ADD OPTION
                </button>
            </div>
            <button onclick="generateNews()" 
                    class="w-full py-5 bg-[#c8102e] hover:bg-[#a00d24] text-2xl font-bold tracking-widest transition-all flex items-center justify-center gap-x-3">
                    GENERATE NEWS EVENT 📰
            </button>
        </div>
    `;
}

function renderNewsOptions() {
    const container = document.getElementById('options-container');
    if (!container) return;
    container.innerHTML = '';
    newsOptions.forEach((opt, i) => {
        const div = document.createElement('div');
        div.className = 'flex gap-3 bg-black border border-[#c8102e] p-3 rounded';
        div.innerHTML = `
            <div class="flex-1">
                <input type="text" value="${opt.name}" onchange="updateOption(${i}, 'name', this.value)" 
                       class="w-full bg-transparent border-b border-[#00ff9d] text-white px-2 py-1 font-mono text-sm focus:outline-none">
            </div>
            <div class="flex-1">
                <input type="text" value="${opt.effect}" onchange="updateOption(${i}, 'effect', this.value)" 
                       class="w-full bg-transparent border-b border-[#00ff9d] text-white px-2 py-1 font-mono text-sm focus:outline-none">
            </div>
            <button onclick="removeOption(${i})" class="text-[#c8102e] hover:text-red-500 px-3 text-xl leading-none">✕</button>
        `;
        container.appendChild(div);
    });
}

function addOption() {
    if (newsOptions.length >= 3) { alert("Maximum 3 options allowed."); return; }
    newsOptions.push({ name: `event.1.${String.fromCharCode(97 + newsOptions.length)}`, effect: "add_political_power = 25" });
    renderNewsOptions();
    generateNews();
}

function removeOption(index) {
    if (newsOptions.length <= 1) return;
    newsOptions.splice(index, 1);
    renderNewsOptions();
    generateNews();
}

function updateOption(index, field, value) {
    newsOptions[index][field] = value;
    generateNews();
}

function generateNews() {
    const id = (document.getElementById('news-id')?.value || 'news.1').trim();
    const title = document.getElementById('news-title')?.value.trim() || 'event.1.t';
    const desc = document.getElementById('news-desc')?.value.trim() || 'event.1.d';
    const picture = document.getElementById('news-picture')?.value.trim() || 'GFX_news_event_generic';
    const triggerTag = (document.getElementById('news-trigger')?.value || 'NEW').toUpperCase().trim();

    let eventCode = `news_event = {\n`;
    eventCode += `    id = ${id}\n`;
    eventCode += `    title = ${title}\n`;
    eventCode += `    desc = ${desc}\n`;
    eventCode += `    picture = ${picture}\n\n`;
    eventCode += `    is_triggered_only = yes\n\n`;
    eventCode += `    trigger = {\n        TAG = ${triggerTag}\n    }\n\n`;

    newsOptions.forEach(opt => {
        eventCode += `    option = {\n        name = ${opt.name}\n        ${opt.effect}\n    }\n\n`;
    });

    eventCode += `}`;

    document.getElementById('news-preview').textContent = eventCode;
    document.getElementById('news-filename').textContent = `${triggerTag}_news_events.txt`;

    lastNewsData = { id, title, desc, picture, triggerTag, options: [...newsOptions], code: eventCode };
}

// ====================== CHARACTER GENERATOR ======================

let lastCharacterData = null;

function renderCharacterForm() {
    const container = document.getElementById('character-form');
    container.innerHTML = `
        <div class="space-y-8">

            <!-- Basic Info -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="input-label block mb-1">CHARACTER ID (unique)</label>
                    <input id="char-id" type="text" value="NEW_leader1" 
                           class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" oninput="liveUpdateCharacter()">
                </div>
                <div>
                    <label class="input-label block mb-1">COUNTRY TAG</label>
                    <input id="char-tag" type="text" value="NEW" maxlength="3"
                           class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" oninput="liveUpdateCharacter()">
                </div>
            </div>

            <div>
                <label class="input-label block mb-1">NAME (localisation key)</label>
                <input id="char-name" type="text" value="NEW_nestor_makhno" 
                       class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" oninput="liveUpdateCharacter()">
                <p class="text-xs text-gray-400 mt-1">Will appear as <span class="text-[#00ff9d]">NEW_nestor_makhno:0 "Nestor Makhno"</span></p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label class="input-label block mb-1">GENDER</label>
                    <select id="char-gender" class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" onchange="liveUpdateCharacter()">
                        <option value="">undefined (default)</option>
                        <option value="male" selected>male</option>
                        <option value="female">female</option>
                    </select>
                </div>
                <div>
                    <label class="input-label block mb-1">PORTRAIT GFX (civilian large)</label>
                    <input id="char-portrait" type="text" value="GFX_portrait_NEW_nestor_makhno" 
                           class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" oninput="liveUpdateCharacter()">
                </div>
                <div>
                    <label class="input-label block mb-1">SMALL PORTRAIT (advisor)</label>
                    <input id="char-small-portrait" type="text" value="GFX_portrait_NEW_nestor_makhno_small" 
                           class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" oninput="liveUpdateCharacter()">
                </div>
            </div>

            <!-- Roles -->
            <div class="space-y-6">
                <!-- Country Leader -->
                <div class="bg-black/60 p-6 rounded border border-[#c8102e]/70">
                    <label class="input-label block mb-3 text-[#00ff9d]">COUNTRY LEADER ROLE</label>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm mb-1">Ideology</label>
                            <input id="char-ideology" type="text" value="anarchist_communism" 
                                   class="w-full bg-black border border-[#c8102e] px-4 py-3 font-mono" oninput="liveUpdateCharacter()">
                        </div>
                        <div>
                            <label class="block text-sm mb-1">Traits (space separated)</label>
                            <input id="char-leader-traits" type="text" value="agrarian_activist" 
                                   class="w-full bg-black border border-[#c8102e] px-4 py-3 font-mono" oninput="liveUpdateCharacter()">
                        </div>
                    </div>
                    <div class="mt-4">
                        <label class="block text-sm mb-1">Description key</label>
                        <input id="char-desc" type="text" value="NEW_nestor_makhno_desc" 
                               class="w-full bg-black border border-[#c8102e] px-4 py-3 font-mono" oninput="liveUpdateCharacter()">
                    </div>
                </div>

                <!-- Advisor Role -->
                <div class="bg-black/60 p-6 rounded border border-[#c8102e]/70">
                    <label class="input-label block mb-3 text-[#00ff9d]">ADVISOR ROLE</label>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-sm mb-1">Slot</label>
                            <select id="char-advisor-slot" class="w-full bg-black border border-[#c8102e] px-4 py-3 font-mono" onchange="liveUpdateCharacter()">
                                <option value="political_advisor">Political Advisor</option>
                                <option value="theorist" selected>Theorist</option>
                                <option value="army_chief">Army Chief</option>
                                <option value="navy_chief">Navy Chief</option>
                                <option value="air_chief">Air Chief</option>
                                <option value="high_command">High Command</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm mb-1">Idea Token</label>
                            <input id="char-idea-token" type="text" value="NEW_makhno_theorist" 
                                   class="w-full bg-black border border-[#c8102e] px-4 py-3 font-mono" oninput="liveUpdateCharacter()">
                        </div>
                        <div>
                            <label class="block text-sm mb-1">Ledger</label>
                            <select id="char-ledger" class="w-full bg-black border border-[#c8102e] px-4 py-3 font-mono" onchange="liveUpdateCharacter()">
                                <option value="army">Army</option>
                                <option value="civilian" selected>Civilian</option>
                                <option value="all">All</option>
                            </select>
                        </div>
                    </div>
                    <div class="mt-4">
                        <label class="block text-sm mb-1">Advisor Traits (space separated)</label>
                        <input id="char-advisor-traits" type="text" value="military_theorist" 
                               class="w-full bg-black border border-[#c8102e] px-4 py-3 font-mono" oninput="liveUpdateCharacter()">
                    </div>
                </div>

                <!-- Corps Commander -->
                <div class="bg-black/60 p-6 rounded border border-[#c8102e]/70">
                    <label class="input-label block mb-3 text-[#00ff9d]">CORPS COMMANDER ROLE</label>
                    <div>
                        <label class="block text-sm mb-1">Traits (space separated)</label>
                        <input id="char-commander-traits" type="text" value="media_personality winter_specialist" 
                               class="w-full bg-black border border-[#c8102e] px-4 py-3 font-mono" oninput="liveUpdateCharacter()">
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
                        <div><input id="char-skill" type="number" value="5" min="0" max="10" class="w-full bg-black border border-[#c8102e] px-4 py-3 font-mono text-center" oninput="liveUpdateCharacter()" placeholder="skill"></div>
                        <div><input id="char-attack" type="number" value="5" min="0" max="10" class="w-full bg-black border border-[#c8102e] px-4 py-3 font-mono text-center" oninput="liveUpdateCharacter()" placeholder="attack"></div>
                        <div><input id="char-defense" type="number" value="3" min="0" max="10" class="w-full bg-black border border-[#c8102e] px-4 py-3 font-mono text-center" oninput="liveUpdateCharacter()" placeholder="defense"></div>
                        <div><input id="char-planning" type="number" value="4" min="0" max="10" class="w-full bg-black border border-[#c8102e] px-4 py-3 font-mono text-center" oninput="liveUpdateCharacter()" placeholder="planning"></div>
                        <div><input id="char-logistics" type="number" value="5" min="0" max="10" class="w-full bg-black border border-[#c8102e] px-4 py-3 font-mono text-center" oninput="liveUpdateCharacter()" placeholder="logistics"></div>
                    </div>
                </div>
            </div>

            <button onclick="generateCharacter()" 
                    class="w-full py-5 bg-[#c8102e] hover:bg-[#a00d24] text-2xl font-bold tracking-widest transition-all">
                GENERATE CHARACTER FILES →
            </button>
        </div>
    `;
}

function liveUpdateCharacter() {
    clearTimeout(liveTimeout);
    liveTimeout = setTimeout(generateCharacter, 10);
}

function generateCharacter() {
    const id = document.getElementById('char-id').value.trim() || 'NEW_leader1';
    const tag = (document.getElementById('char-tag').value || 'NEW').toUpperCase().trim();
    const nameKey = document.getElementById('char-name').value.trim() || `${tag}_character`;
    const gender = document.getElementById('char-gender').value;
    const portrait = document.getElementById('char-portrait').value.trim() || `GFX_portrait_${id}`;
    const smallPortrait = document.getElementById('char-small-portrait').value.trim() || `${portrait}_small`;

    // Country Leader
    const ideology = document.getElementById('char-ideology').value.trim() || 'neutrality';
    const leaderTraits = document.getElementById('char-leader-traits').value.trim();
    const descKey = document.getElementById('char-desc').value.trim() || `${id}_desc`;

    // Advisor
    const advisorSlot = document.getElementById('char-advisor-slot').value;
    const ideaToken = document.getElementById('char-idea-token').value.trim() || `${id}_advisor`;
    const ledger = document.getElementById('char-ledger').value;
    const advisorTraits = document.getElementById('char-advisor-traits').value.trim();

    // Commander
    const cmdTraits = document.getElementById('char-commander-traits').value.trim();
    const skill = parseInt(document.getElementById('char-skill').value) || 5;
    const attack = parseInt(document.getElementById('char-attack').value) || 5;
    const defense = parseInt(document.getElementById('char-defense').value) || 3;
    const planning = parseInt(document.getElementById('char-planning').value) || 4;
    const logistics = parseInt(document.getElementById('char-logistics').value) || 5;

    let charCode = `characters = {\n`;
    charCode += `    ${id} = {\n`;
    charCode += `        name = ${nameKey}\n`;
    if (gender) charCode += `        gender = ${gender}\n`;

    charCode += `        portraits = {\n`;
    charCode += `            civilian = {\n`;
    charCode += `                large = ${portrait}\n`;
    charCode += `                small = ${smallPortrait}\n`;
    charCode += `            }\n`;
    charCode += `            army = {\n`;
    charCode += `                large = ${portrait}\n`;
    charCode += `            }\n`;
    charCode += `        }\n\n`;

    // Country Leader
    charCode += `        country_leader = {\n`;
    charCode += `            ideology = ${ideology}\n`;
    if (leaderTraits) charCode += `            traits = { ${leaderTraits} }\n`;
    charCode += `            desc = ${descKey}\n`;
    charCode += `        }\n\n`;

    // Advisor
    charCode += `        advisor = {\n`;
    charCode += `            slot = ${advisorSlot}\n`;
    charCode += `            idea_token = ${ideaToken}\n`;
    charCode += `            ledger = ${ledger}\n`;
    if (advisorTraits) charCode += `            traits = { ${advisorTraits} }\n`;
    charCode += `        }\n\n`;

    // Corps Commander
    charCode += `        corps_commander = {\n`;
    if (cmdTraits) charCode += `            traits = { ${cmdTraits} }\n`;
    charCode += `            skill = ${skill}\n`;
    charCode += `            attack_skill = ${attack}\n`;
    charCode += `            defense_skill = ${defense}\n`;
    charCode += `            planning_skill = ${planning}\n`;
    charCode += `            logistics_skill = ${logistics}\n`;
    charCode += `        }\n`;
    charCode += `    }\n`;
    charCode += `}`;

    // Localisation snippet
    const locSnippet = ` ${nameKey}:0 "Nestor Makhno (change me)"\n ${descKey}:0 "The Black Army leader and anarchist revolutionary."\n`;

    const preview = `# common/characters/${tag}_characters.txt\n` +
                    `${charCode}\n\n` +
                    `# Add to history/countries/${tag}_1936.txt (or your history file):\n` +
                    `recruit_character = ${id}\n\n` +
                    `# Localisation (english/${tag}_l_english.yml):\n` +
                    `l_english:\n${locSnippet}\n` +
                    `# Don't forget to add the GFX portrait definitions in interface/ files!`;

    document.getElementById('character-preview').textContent = preview;
    document.getElementById('char-filename').textContent = `${tag}_characters.txt`;
    document.getElementById('char-loc-filename').textContent = `${tag}_l_english.yml`;

    lastCharacterData = { id, tag, code: charCode, loc: locSnippet };
}

// ====================== NATIONAL FOCUS GENERATOR v2.8 ======================

let lastFocusData = null;

function renderFocusForm() {
    const container = document.getElementById('focus-form');
    container.innerHTML = `
        <div class="space-y-8">

            <!-- Basic Info -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="input-label block mb-1">FOCUS TREE ID (e.g. NEW_focus_tree)</label>
                    <input id="focus-tree-id" type="text" value="NEW_focus_tree" 
                           class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" oninput="liveUpdateFocus()">
                </div>
                <div>
                    <label class="input-label block mb-1">COUNTRY TAG</label>
                    <input id="focus-tag" type="text" value="NEW" maxlength="3"
                           class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" oninput="liveUpdateFocus()">
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label class="input-label block mb-1">FOCUS ID</label>
                    <input id="focus-id" type="text" value="NEW_industrial_effort" 
                           class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" oninput="liveUpdateFocus()">
                </div>
                <div>
                    <label class="input-label block mb-1">ICON</label>
                    <input id="focus-icon" type="text" value="GFX_goal_generic_production" 
                           class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" oninput="liveUpdateFocus()">
                </div>
                <div>
                    <label class="input-label block mb-1">COST (days)</label>
                    <input id="focus-cost" type="number" value="70" min="1" 
                           class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" oninput="liveUpdateFocus()">
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="input-label block mb-1">X POSITION</label>
                    <input id="focus-x" type="number" value="0" 
                           class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" oninput="liveUpdateFocus()">
                </div>
                <div>
                    <label class="input-label block mb-1">Y POSITION</label>
                    <input id="focus-y" type="number" value="0" 
                           class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" oninput="liveUpdateFocus()">
                </div>
            </div>

            <div>
                <label class="input-label block mb-1">PREREQUISITE (optional)</label>
                <input id="focus-prereq" type="text" value="" placeholder="e.g. NEW_previous_focus"
                       class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-xl font-mono" oninput="liveUpdateFocus()">
            </div>

            <div>
                <label class="input-label block mb-2">COMPLETION REWARD (one command per line)</label>
                <textarea id="focus-effects" rows="10" class="w-full bg-black border-2 border-[#c8102e] px-4 py-3 text-sm font-mono">add_ideas = civilian_economy
add_political_power = 50
add_stability = 0.05</textarea>
            </div>

            <div class="flex gap-4">
                <button onclick="generateFocus()" 
                        class="flex-1 py-5 bg-[#c8102e] hover:bg-[#a00d24] text-2xl font-bold tracking-widest transition-all">
                    GENERATE FOCUS TREE →
                </button>
                <button onclick="randomizeFocus()" 
                        class="px-8 py-5 bg-[#00ff9d] hover:bg-[#00cc7a] text-black text-2xl font-bold tracking-widest transition-all">
                    🎲 RANDOM
                </button>
            </div>
        </div>
    `;
}

function liveUpdateFocus() {
    clearTimeout(liveTimeout);
    liveTimeout = setTimeout(generateFocus, 10);
}

function generateFocus() {
    const treeId = document.getElementById('focus-tree-id').value.trim() || 'NEW_focus_tree';
    const tag = (document.getElementById('focus-tag').value || 'NEW').toUpperCase().trim();
    const id = document.getElementById('focus-id').value.trim() || 'NEW_industrial_effort';
    const icon = document.getElementById('focus-icon').value.trim() || 'GFX_goal_generic_production';
    const x = parseInt(document.getElementById('focus-x').value) || 0;
    const y = parseInt(document.getElementById('focus-y').value) || 0;
    const cost = parseInt(document.getElementById('focus-cost').value) || 70;
    const prereq = document.getElementById('focus-prereq').value.trim();

    const effectsLines = document.getElementById('focus-effects').value.trim().split('\n');

    let code = `focus_tree = {\n`;
    code += `    id = ${treeId}\n\n`;
    code += `    country = {\n        factor = 1\n        modifier = { add = 10 tag = ${tag} }\n    }\n\n`;
    code += `    focus = {\n`;
    code += `        id = ${id}\n`;
    code += `        icon = ${icon}\n\n`;
    code += `        x = ${x}\n`;
    code += `        y = ${y}\n\n`;
    code += `        cost = ${cost}\n\n`;

    if (prereq) {
        code += `        prerequisite = { focus = ${prereq} }\n\n`;
    }

    code += `        completion_reward = {\n`;
    effectsLines.forEach(line => {
        if (line.trim()) code += `            ${line.trim()}\n`;
    });
    code += `        }\n`;
    code += `    }\n`;
    code += `}`;

    const preview = `# common/national_focus/${tag}_focuses.txt\n\n${code}\n\n` +
                    `# Localisation (add to english/${tag}_l_english.yml):\n` +
                    `l_english:\n` +
                    ` ${id}:0 "Industrial Effort"\n` +
                    ` ${id}_desc:0 "Strengthen our industrial base."\n\n` +
                    `Remember: Create portrait GFX if needed and assign the tree in your country history file with:\n` +
                    `    set_focus_tree = ${treeId}`;

    document.getElementById('focus-preview').textContent = preview;
    document.getElementById('focus-filename').textContent = `${tag}_focuses.txt`;

    lastFocusData = { id: treeId, tag, code };
}

function randomizeFocus() {
    const ideas = ["industrial_effort", "military_buildup", "political_reform", "naval_expansion", "air_superiority", "research_investment"];
    const randomId = "NEW_" + ideas[Math.floor(Math.random()*ideas.length)] + "_" + Math.floor(Math.random()*99);
    
    document.getElementById('focus-id').value = randomId;
    document.getElementById('focus-id').value = randomId;
    document.getElementById('focus-icon').value = ["GFX_goal_generic_production", "GFX_goal_generic_army", "GFX_goal_generic_navy", "GFX_goal_generic_air", "GFX_goal_generic_construction"][Math.floor(Math.random()*5)];
    document.getElementById('focus-x').value = Math.floor(Math.random()*10) - 3;
    document.getElementById('focus-y').value = Math.floor(Math.random()*8);
    document.getElementById('focus-cost').value = [35, 50, 70, 90, 120][Math.floor(Math.random()*5)];
    document.getElementById('focus-prereq').value = Math.random() > 0.5 ? "NEW_previous_focus" : "";

    document.getElementById('focus-effects').value = `add_ideas = { ${["civilian_economy","war_economy","partial_economic_mobilisation"][Math.floor(Math.random()*3)]} }\nadd_political_power = ${30 + Math.floor(Math.random()*70)}\nadd_stability = 0.0${10 + Math.floor(Math.random()*5)}`;
    
    document.getElementById('focus-reward').value = `add_tech_bonus = {\n    name = ${randomId}\n    bonus = 1\n    uses = 1\n    technology = ${["construction_2","infantry_weapons_2","electronic_mechanical_engineering"][Math.floor(Math.random()*3)]}\n}`;

    generateFocus();
}

// ====================== EXPORT FUNCTIONS ======================
function exportCountryFiles() {
    if (!lastCountryData) { alert("Please generate a country first!"); return; }
    const content = `=== HOI4 COUNTRY EXPORT - ${lastCountryData.tag} ===\n\n` +
                   `1. common/country_tags/${lastCountryData.tag}.txt\n` +
                   lastCountryData.files.tagfile + "\n\n" +
                   `2. common/countries/${lastCountryData.tag}.txt\n` +
                   lastCountryData.files.common + "\n\n" +
                   `3. history/countries/${lastCountryData.tag} - ${lastCountryData.name}.txt\n` +
                   lastCountryData.files.history + "\n\n" +
                   `4. localisation/english/${lastCountryData.tag}_l_english.yml\n` +
                   lastCountryData.files.localisation;
    downloadFile(content, `${lastCountryData.tag}_full_country_pack.txt`, 'text/plain');
}

function exportNewsFile() {
    if (!lastNewsData) { alert("Please generate a news event first!"); return; }
    downloadFile(lastNewsData.code, `${lastNewsData.id.replace(/\./g, '_')}.txt`, 'text/plain');
}

function exportCharacterFile() {
    if (!lastCharacterData) {
        alert("Generate a character first!");
        return;
    }
    const content = lastCharacterData.code + "\n\n# Localisation snippet:\n" + lastCharacterData.loc;
    downloadFile(content, `${lastCharacterData.tag}_character_${lastCharacterData.id}.txt`, 'text/plain');
}

function exportFocusFile() {
    if (!lastFocusData) {
        alert("Generate a national focus first!");
        return;
    }
    downloadFile(lastFocusData.code, `${lastFocusData.tag}_focus_${lastFocusData.id}.txt`, 'text/plain');
}

function downloadFile(content, filename, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function copyToClipboard(elementId) {
    const text = document.getElementById(elementId).textContent;
    if (!text) { alert("Nothing to copy yet!"); return; }
    navigator.clipboard.writeText(text).then(() => {
        const btn = event.target;
        const original = btn.textContent;
        btn.textContent = '✓ COPIED!';
        setTimeout(() => btn.textContent = original, 1500);
    });
}

function exportAllData() {
    const exportObj = { version: "2.3.3", exportedAt: new Date().toISOString(), country: lastCountryData, news: lastNewsData };
    if (!lastCountryData && !lastNewsData) { alert("Generate at least one country or news event first!"); return; }
    downloadFile(JSON.stringify(exportObj, null, 2), `hoi4_generator_export_${new Date().toISOString().slice(0,10)}.json`, 'application/json');
}

// ====================== INITIALIZATION ======================
window.onload = function() {
    renderCountryForm();
    renderNewsForm();
    renderNewsOptions();
    renderCharacterForm();
    renderFocusForm();          

    setTimeout(() => {
        normalizeParties();
        generateCountry();
        generateNews();
        generateCharacter();
        generateFocus();            
        console.log('%cHOI4 Generator v2.8 - National Focus tab added!', 'color:#00ff9d; font-size:16px');
    }, 100);
};