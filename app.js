import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, get, set, push, remove, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const EXCLUSIVE_ADMIN_EMAIL = "raiyuri.freefire@gmail.com";
const AVAILABLE_GENRES = ["Ação","Aventura","Comédia","Drama","Terror","Suspense","Romance","Ficção Científica","Fantasia","Animação","Documentário","Musical","Guerra","Mistério","Crime","Família","Histórico","Faroeste"];
const FIREBASE_RTDB_FREE_LIMIT_BYTES = 1073741824; // 1 GB

const firebaseConfig = {
    apiKey: "AIzaSyCGD9DZDFp0w9baW8jiqgGGfkasAvqreY0",
    authDomain: "site-ec6fd.firebaseapp.com",
    databaseURL: "https://site-ec6fd-default-rtdb.firebaseio.com",
    projectId: "site-ec6fd",
    storageBucket: "site-ec6fd.firebasestorage.app",
    messagingSenderId: "338689686380",
    appId: "1:338689686380:web:509aebb8d64694a0e1d149"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const rtdb = getDatabase(app);

let mediaCatalog = [];
let activeItem = null;
let seasonsBuilder = [];
let selectedCategory = "Todos";
let isSignUpMode = false;
let selectedGenres = [];
let cropperInstance = null;
let currentTargetInput = null;
let currentTargetPreview = null;
let previousModal = null;
let controlsHideTimer = null;
let cursorHideTimer = null;
let originalWindowOpen = null;
let notificationBlockerActive = false;
let isAdmin = false;
let suggestionsSelectMode = false;
let selectedSuggestionIds = new Set();
let allSuggestions = [];

const playerBox = document.getElementById('playerModalBox');
const playerControls = document.getElementById('playerControlsTop');
const playerContainer = document.getElementById('playerContainerView');
const playerLoading = document.getElementById('playerLoading');

// ========== UTILS ==========
function normalizeText(t) { if (!t) return ''; return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim(); }
function getPosterUrl(i) { return i.coverUrl || i.backdropUrl || ''; }
function getBackdropUrl(i) { return i.backdropUrl || i.coverUrl || ''; }
function getEpisodeThumb(ep, sd, si) {
    if (ep.thumbUrl && ep.thumbUrl.trim() !== '' && !ep.thumbUrl.includes('window.location')) return ep.thumbUrl;
    if (sd && sd.seasonCoverUrl && sd.seasonCoverUrl.trim() !== '' && !sd.seasonCoverUrl.includes('window.location')) return sd.seasonCoverUrl;
    return getBackdropUrl(si) || getPosterUrl(si);
}
function getItemGenres(i) { if (Array.isArray(i.genres) && i.genres.length > 0) return i.genres; if (i.category) return [i.category]; return []; }
function itemMatchesCategory(i, c) { if (c === "Todos") return true; if (c === "Filmes") return i.type === "movie"; if (c === "Séries") return i.type === "serie"; return getItemGenres(i).includes(c); }
function isTVDevice() { return /smarttv|googletv|appletv|hbbtv|pov_tv|netcast|viera|bravia|tizen|webos|crkey|playstation|xbox|nintendo/i.test(navigator.userAgent.toLowerCase()); }
function showMsg(text, type) { const m = document.getElementById('msg'); m.innerText = text; m.className = type === 'success' ? 'msg-success' : 'msg-error'; m.classList.remove('hidden'); setTimeout(() => m.classList.add('hidden'), 4000); }
function applyUserTheme(c) { if (!c || isTVDevice()) return; document.documentElement.style.setProperty('--primary-color', c); localStorage.setItem('masterflix_theme_color', c); }
function formatVideoUrl(u) { if (!u) return ''; let f = u.trim(); if (f.includes('mixdrop.')) { if (f.includes('/f/')) f = f.replace('/f/','/e/'); else if (!f.includes('/e/')) { const m = f.match(/(?:mixdrop\.[a-z]+)\/(?:e\/|f\/)?([a-zA-Z0-9]+)/); if (m && m[1]) f = `https://mixdrop.top/e/${m[1]}`; } } return f; }
function formatBytes(b) { if (b === 0) return '0 B'; const k = 1024; const s = ['B','KB','MB','GB']; const i = Math.floor(Math.log(b) / Math.log(k)); return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + s[i]; }
function estimateJsonBytes(obj) { try { return new Blob([JSON.stringify(obj)]).size; } catch(e) { return JSON.stringify(obj).length * 2; } }

if (!isTVDevice()) { const sc = localStorage.getItem('masterflix_theme_color'); if (sc) applyUserTheme(sc); }

window.onscroll = () => { const h = document.getElementById('mainHeader'); if (window.scrollY > 50) h.classList.add('scrolled'); else h.classList.remove('scrolled'); };

// ========== SIDEBAR ==========
const menuToggleBtn = document.getElementById('menuToggleBtn');
const sidebarMenu = document.getElementById('sidebarMenu');
const sidebarOverlay = document.getElementById('sidebarOverlay');
function openSidebar() { sidebarMenu.classList.add('active'); sidebarOverlay.classList.add('active'); menuToggleBtn.classList.add('active'); document.body.style.overflow = 'hidden'; }
function closeSidebar() { sidebarMenu.classList.remove('active'); sidebarOverlay.classList.remove('active'); menuToggleBtn.classList.remove('active'); document.body.style.overflow = ''; }
menuToggleBtn.onclick = () => sidebarMenu.classList.contains('active') ? closeSidebar() : openSidebar();
document.getElementById('sidebarCloseBtn').onclick = closeSidebar;
sidebarOverlay.onclick = closeSidebar;

document.querySelectorAll('.sidebar-item').forEach(item => {
    item.onclick = () => {
        const a = item.dataset.nav;
        document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
        if (['home','movies','series','continue'].includes(a)) item.classList.add('active');
        closeSidebar();
        if (a === 'home') { selectedCategory = "Todos"; updateCategoryChips(); renderApp(); window.scrollTo({top:0,behavior:'smooth'}); }
        else if (a === 'movies') { selectedCategory = "Filmes"; updateCategoryChips(); renderApp(); window.scrollTo({top:300,behavior:'smooth'}); }
        else if (a === 'series') { selectedCategory = "Séries"; updateCategoryChips(); renderApp(); window.scrollTo({top:300,behavior:'smooth'}); }
        else if (a === 'continue') { const r = document.getElementById('continueRow'); if (!r.classList.contains('hidden')) r.scrollIntoView({behavior:'smooth',block:'start'}); else showMsg('Nada em andamento!','error'); }
        else if (a === 'suggestions') document.getElementById('suggestionModal').classList.remove('hidden');
        else if (a === 'profile') document.getElementById('profileModal').classList.remove('hidden');
        else if (a === 'admin') { renderAdminCatalogList(); document.getElementById('adminModal').classList.remove('hidden'); }
        else if (a === 'creator') openCreator();
        else if (a === 'suggestionsAdmin') { loadSuggestionsAdmin(); document.getElementById('suggestionsAdminModal').classList.remove('hidden'); }
        else if (a === 'storage') { loadStorageInfo(); document.getElementById('storageModal').classList.remove('hidden'); }
        else if (a === 'logout') { if (confirm('Sair da conta?')) handleLogout(); }
    };
});

function updateCategoryChips() { document.querySelectorAll('.category-chip').forEach(c => c.classList.toggle('active', c.dataset.cat === selectedCategory)); }

document.querySelectorAll('.category-chip').forEach(chip => {
    chip.onclick = () => {
        document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        selectedCategory = chip.dataset.cat;
        renderApp();
    };
});

// ========== GENRE SELECTOR ==========
function renderGenreSelector() {
    const c = document.getElementById('genreSelectorContainer'); c.innerHTML = '';
    AVAILABLE_GENRES.forEach(g => {
        const t = document.createElement('div'); t.className = 'genre-tag';
        if (selectedGenres.includes(g)) t.classList.add('selected');
        t.textContent = g;
        t.onclick = () => { const i = selectedGenres.indexOf(g); if (i >= 0) selectedGenres.splice(i,1); else selectedGenres.push(g); renderGenreSelector(); };
        c.appendChild(t);
    });
    const ct = document.getElementById('genreCounter');
    if (selectedGenres.length === 0) { ct.textContent = '⚠️ Selecione ao menos 1'; ct.style.color = '#ff9800'; }
    else { ct.textContent = `✓ ${selectedGenres.length}: ${selectedGenres.join(', ')}`; ct.style.color = 'var(--primary-color)'; }
}

// ========== CROPPER ==========
window.triggerCropModal = function(inputId, previewId, ar) {
    const fi = document.getElementById(inputId); currentTargetInput = fi; currentTargetPreview = document.getElementById(previewId);
    fi.onchange = (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const tmp = new Image();
            tmp.onload = () => {
                if (tmp.naturalWidth <= 800 && tmp.naturalHeight <= 800) { if (currentTargetPreview) { currentTargetPreview.src = ev.target.result; currentTargetPreview.classList.remove('hidden'); } fi.value = ""; return; }
                document.getElementById('cropperImage').src = ev.target.result;
                if (!document.getElementById('profileModal').classList.contains('hidden')) { previousModal = 'profileModal'; document.getElementById('profileModal').classList.add('hidden'); }
                else if (!document.getElementById('creatorModal').classList.contains('hidden')) { previousModal = 'creatorModal'; document.getElementById('creatorModal').classList.add('hidden'); }
                document.getElementById('cropperModal').classList.remove('hidden');
                if (cropperInstance) cropperInstance.destroy();
                cropperInstance = new Cropper(document.getElementById('cropperImage'), {
                    aspectRatio: ar || NaN, viewMode: 1, autoCropArea: 1, responsive: true, restore: false, center: true, highlight: false,
                    crop() { const cv = cropperInstance.getCroppedCanvas({width:800,imageSmoothingQuality:'high'}); if (cv) { const u = cv.toDataURL('image/jpeg',0.90); document.getElementById('prevMobile').src=u; document.getElementById('prevPC').src=u; document.getElementById('prevTV').src=u; } }
                });
            };
            tmp.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    };
    fi.click();
};

document.getElementById('btnConfirmCrop').onclick = () => {
    if (!cropperInstance) return;
    const cv = cropperInstance.getCroppedCanvas({width:1200,imageSmoothingQuality:'high'});
    if (cv && currentTargetPreview) { currentTargetPreview.src = cv.toDataURL('image/jpeg',0.92); currentTargetPreview.classList.remove('hidden'); }
    document.getElementById('cropperModal').classList.add('hidden');
    if (previousModal) document.getElementById(previousModal).classList.remove('hidden');
    if (cropperInstance) cropperInstance.destroy();
};
document.getElementById('btnCloseCropper').onclick = () => { document.getElementById('cropperModal').classList.add('hidden'); if (previousModal) document.getElementById(previousModal).classList.remove('hidden'); if (cropperInstance) cropperInstance.destroy(); };

// ========== SEARCH ==========
const searchWrapper = document.getElementById('searchWrapper');
const searchBox = document.getElementById('searchBox');
const searchInput = document.getElementById('searchInput');
const searchDropdown = document.getElementById('searchResultsDropdown');
function openSearch() { searchBox.classList.add('active'); setTimeout(() => searchInput.focus(), 200); }
function closeSearch() { if (searchInput.value.trim() === '') { searchBox.classList.remove('active','has-text'); searchDropdown.classList.remove('visible'); } }
document.getElementById('searchIconBtn').addEventListener('click', (e) => { e.stopPropagation(); if (searchBox.classList.contains('active')) { if (searchInput.value.trim()==='') closeSearch(); } else openSearch(); });
searchInput.addEventListener('input', () => { const v = searchInput.value.trim(); if (v.length > 0) { searchBox.classList.add('has-text'); renderSearchDropdown(v); } else { searchBox.classList.remove('has-text'); searchDropdown.classList.remove('visible'); } });
document.getElementById('searchClearBtn').addEventListener('click', (e) => { e.stopPropagation(); searchInput.value = ''; searchBox.classList.remove('has-text'); searchDropdown.classList.remove('visible'); searchInput.focus(); });
searchInput.addEventListener('focus', () => { if (searchInput.value.trim().length > 0) renderSearchDropdown(searchInput.value.trim()); });
searchInput.addEventListener('keydown', (e) => { if (e.key==='Escape') { searchInput.value=''; searchBox.classList.remove('has-text'); searchDropdown.classList.remove('visible'); closeSearch(); searchInput.blur(); } else if (e.key==='Enter') { e.preventDefault(); const f = searchDropdown.querySelector('.search-result-item'); if (f) f.click(); } else if (e.key==='ArrowDown') { e.preventDefault(); const f = searchDropdown.querySelector('.search-result-item'); if (f) f.focus(); } });
searchDropdown.addEventListener('keydown', (e) => { const items = Array.from(searchDropdown.querySelectorAll('.search-result-item')); const ci = items.indexOf(document.activeElement); if (e.key==='ArrowDown') { e.preventDefault(); if (items[ci+1]) items[ci+1].focus(); } else if (e.key==='ArrowUp') { e.preventDefault(); if (ci<=0) searchInput.focus(); else items[ci-1].focus(); } else if (e.key==='Enter') { e.preventDefault(); if (document.activeElement?.classList.contains('search-result-item')) document.activeElement.click(); } else if (e.key==='Escape') searchInput.focus(); });
document.addEventListener('click', (e) => { if (!searchWrapper.contains(e.target)) { searchDropdown.classList.remove('visible'); if (searchInput.value.trim()==='') searchBox.classList.remove('active'); } });

function smartSearch(q) { const nq = normalizeText(q); if (!nq) return []; const sc=[]; mediaCatalog.forEach(i => { const t = normalizeText(i.title); if (!t) return; let s=0; if (t.startsWith(nq)) s=1000-t.length; else { let ws=false; for (const w of t.split(/\s+/)) if (w.startsWith(nq)) { ws=true; break; } if (ws) s=500-t.length; else if (t.includes(nq)) s=100-t.length; } if (s>0) sc.push({item:i,score:s}); }); sc.sort((a,b)=>b.score-a.score); return sc.slice(0,8).map(s=>s.item); }
function highlightMatch(t, q) { const nt=normalizeText(t), nq=normalizeText(q), i=nt.indexOf(nq); if (i===-1) return t; return t.substring(0,i)+'<mark>'+t.substring(i,i+q.length)+'</mark>'+t.substring(i+q.length); }

function renderSearchDropdown(query) {
    const results = smartSearch(query); searchDropdown.innerHTML = '';
    if (results.length === 0) { searchDropdown.innerHTML = `<div class="search-no-results">🔍 Nada encontrado para "${query}"</div>`; }
    else { results.forEach(item => {
        const d = document.createElement('div'); d.className = 'search-result-item'; d.tabIndex = 0;
        const p = getPosterUrl(item)||'https://via.placeholder.com/50x70?text=?';
        const tl = item.type==='movie'?'Filme':'Série';
        let gt=''; if (Array.isArray(item.genres)&&item.genres.length>0) gt=item.genres.slice(0,2).join(', '); else if (item.category) gt=item.category;
        d.innerHTML = `<img class="search-result-thumb" src="${p}" onerror="this.src='https://via.placeholder.com/50x70?text=?'"><div class="search-result-info"><div class="search-result-title">${highlightMatch(item.title,query)}</div><div class="search-result-meta"><span class="tag">${tl}</span>${gt?' • '+gt:''}${item.year?' • '+item.year:''}</div></div>`;
        d.onclick = () => { searchDropdown.classList.remove('visible'); searchInput.value=''; searchBox.classList.remove('has-text'); closeSearch(); window.location.hash=`#/midia/${item.id}`; openDetails(item); };
        searchDropdown.appendChild(d);
    }); }
    searchDropdown.classList.add('visible');
}

// ========== HASH ROUTING ==========
function handleHashRouting() { const h = window.location.hash; if (h.startsWith('#/midia/')) { const id = h.replace('#/midia/',''); const i = mediaCatalog.find(m=>m.id===id); if (i) openDetails(i); } }
window.addEventListener('hashchange', handleHashRouting);

// ========== MEDIA TYPE TOGGLE ==========
document.getElementById('mediaType').onchange = (e) => {
    const t = e.target.value;
    if (t==='movie') { document.getElementById('movieFileArea').classList.remove('hidden'); document.getElementById('seriesBuilderArea').classList.add('hidden'); document.getElementById('mediaDurationLabel').innerText="Duração (Ex: 2h 10m)"; document.getElementById('mediaDuration').placeholder="Ex: 2h 10m"; }
    else { document.getElementById('movieFileArea').classList.add('hidden'); document.getElementById('seriesBuilderArea').classList.remove('hidden'); document.getElementById('mediaDurationLabel').innerText="Duração Média (Ex: 45m/ep)"; document.getElementById('mediaDuration').placeholder="Ex: 45m/ep"; if (seasonsBuilder.length===0) addSeason(); }
};

// ========== SEASONS BUILDER ==========
function renderSeasonsBuilder() {
    const c = document.getElementById('seasonsList'); c.innerHTML = "";
    seasonsBuilder.forEach((s, si) => {
        const d = document.createElement('div'); d.style.cssText = "background:#181818;border:1px solid #333;border-radius:8px;padding:12px;margin-top:12px;";
        d.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><strong style="color:var(--primary-color);font-size:13px;">Temporada ${si+1}</strong><button type="button" class="btn-secondary" style="font-size:10px;padding:4px 8px;" onclick="addEpisode(${si})">+ Episódio</button></div><div class="input-group" style="margin-bottom:8px;"><label style="font-size:10px;">Foto Temporada (16:9)</label><div class="file-upload-box" onclick="triggerCropModal('seasonCoverFile_${si}','seasonCoverPrev_${si}',16/9)"><span class="file-upload-label">📁 Foto</span><input type="file" id="seasonCoverFile_${si}" accept="image/*" class="hidden"><img id="seasonCoverPrev_${si}" src="${s.seasonCoverUrl||''}" class="file-preview-img ${s.seasonCoverUrl?'':'hidden'}"></div></div><div id="episodesListBuilder_${si}"></div>`;
        c.appendChild(d);
        const el = d.querySelector(`#episodesListBuilder_${si}`);
        (s.episodes||[]).forEach((ep, ei) => {
            const ed = document.createElement('div'); ed.style.cssText = "background:#111;border:1px solid #282828;border-radius:6px;padding:10px;margin-top:10px;";
            ed.innerHTML = `<strong style="font-size:10px;color:#aaa;">EP ${ei+1}</strong><div class="input-group" style="margin-top:4px;margin-bottom:6px;"><label style="font-size:9px;">Título</label><input type="text" id="epTitle_${si}_${ei}" value="${ep.title||''}" placeholder="Nome"></div><div class="input-group" style="margin-bottom:6px;"><label style="font-size:9px;">Duração</label><input type="text" id="epDuration_${si}_${ei}" value="${ep.duration||''}" placeholder="45m"></div><div class="input-group" style="margin-bottom:6px;"><label style="font-size:9px;">Thumb (16:9)</label><div class="file-upload-box" onclick="triggerCropModal('epThumbFile_${si}_${ei}','epThumbPrev_${si}_${ei}',16/9)"><span class="file-upload-label">📸 Foto</span><input type="file" id="epThumbFile_${si}_${ei}" accept="image/*" class="hidden"><img id="epThumbPrev_${si}_${ei}" src="${ep.thumbUrl||''}" class="file-preview-img ${ep.thumbUrl?'':'hidden'}"></div></div><div class="input-group" style="margin-bottom:2px;"><label style="font-size:9px;">Link Vídeo</label><input type="text" id="epVideoUrl_${si}_${ei}" value="${ep.videoUrl||''}" placeholder="Mixdrop"></div>`;
            el.appendChild(ed);
        });
    });
}
function addSeason() { seasonsBuilder.push({seasonNumber:seasonsBuilder.length+1,seasonCoverUrl:'',episodes:[{title:'Episódio 1',duration:'45m',videoUrl:'',thumbUrl:''}]}); renderSeasonsBuilder(); }
window.addEpisode = (si) => { seasonsBuilder[si].episodes.push({title:`Episódio ${seasonsBuilder[si].episodes.length+1}`,duration:'45m',videoUrl:'',thumbUrl:''}); renderSeasonsBuilder(); };
document.getElementById('btnAddSeasonBtn').onclick = addSeason;

// ========== CATALOG ==========
async function loadCatalog() {
    try {
        const snap = await get(ref(rtdb,"catalog")); mediaCatalog = [];
        if (snap.exists()) { const d = snap.val(); for (let k in d) { const i = {id:k,...d[k]}; if (!Array.isArray(i.genres)) i.genres = i.category?[i.category]:[]; mediaCatalog.push(i); } }
        renderApp(); renderAdminCatalogList(); handleHashRouting();
    } catch(e) { showMsg('Erro: '+e.message,'error'); }
}

// ========== CONTINUE WATCHING ==========
function saveContinueWatching(mi, extra='') {
    try {
        let cl = JSON.parse(localStorage.getItem('masterflix_continue_watching')||'[]');
        cl = cl.filter(i=>i.id!==mi.id);
        cl.unshift({id:mi.id,title:mi.title,type:mi.type,coverUrl:getBackdropUrl(mi)||getPosterUrl(mi),duration:mi.duration||extra||'45m',timestamp:Date.now(),extra});
        if (cl.length>20) cl.pop();
        localStorage.setItem('masterflix_continue_watching',JSON.stringify(cl));
        renderContinueWatching();
    } catch(e) { console.error(e); }
}

function renderContinueWatching() {
    const cr = document.getElementById('continueRow');
    const cc = document.getElementById('continueCarousel');
    cc.innerHTML = "";
    try {
        let list = JSON.parse(localStorage.getItem('masterflix_continue_watching')||'[]');
        // Filtra pela categoria selecionada
        if (selectedCategory === "Filmes") list = list.filter(i => i.type === 'movie');
        else if (selectedCategory === "Séries") list = list.filter(i => i.type === 'serie');
        else if (selectedCategory !== "Todos") {
            // Filtra por gênero usando o catálogo original
            list = list.filter(i => {
                const original = mediaCatalog.find(m => m.id === i.id);
                if (!original) return false;
                return getItemGenres(original).includes(selectedCategory);
            });
        }

        if (list.length === 0) { cr.classList.add('hidden'); return; }
        cr.classList.remove('hidden');
        list.forEach(item => {
            const card = document.createElement('div'); card.className = 'continue-card'; card.tabIndex = 0;
            card.innerHTML = `<img src="${item.coverUrl||'https://via.placeholder.com/300x180?text=?'}" alt="${item.title}"><div class="continue-progress-bar"></div><div class="continue-info"><div style="font-size:11px;font-weight:800;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;">${item.title}</div><div class="continue-duration">⏳ ${item.duration}</div></div>`;
            card.onclick = () => { const o = mediaCatalog.find(m=>m.id===item.id); if (o) openDetails(o); };
            cc.appendChild(card);
        });
    } catch(e) { console.error(e); }
}

// ========== RENDER ==========
function renderApp() {
    const mc = document.getElementById('moviesCarousel'), sc = document.getElementById('seriesCarousel');
    const mr = document.getElementById('moviesRow'), sr = document.getElementById('seriesRow');
    mc.innerHTML = ""; sc.innerHTML = "";
    if (selectedCategory === "Filmes") { mr.classList.remove('hidden'); sr.classList.add('hidden'); }
    else if (selectedCategory === "Séries") { mr.classList.add('hidden'); sr.classList.remove('hidden'); }
    else { mr.classList.remove('hidden'); sr.classList.remove('hidden'); }

    mediaCatalog.forEach(item => {
        if (!itemMatchesCategory(item, selectedCategory)) return;
        const card = document.createElement('div'); card.className = 'media-card'; card.tabIndex = 0;
        const ps = getPosterUrl(item), gs = getItemGenres(item), tg = gs.length>0?gs[0]:(item.type==='movie'?'Filme':'Série');
        if (ps) { card.innerHTML = `<img class="media-card-poster" src="${ps}" alt="${item.title}" loading="lazy" onerror="this.style.display='none';this.parentElement.querySelector('.media-card-fallback-hidden').style.display='flex';"><div class="media-card-poster-fallback media-card-fallback-hidden" style="display:none;position:absolute;inset:0;">🎬</div><div class="media-card-overlay"><span class="media-card-tag">${tg}</span><div class="media-card-title">${item.title}</div></div>`; }
        else { card.innerHTML = `<div class="media-card-poster-fallback">🎬</div><div class="media-card-overlay"><span class="media-card-tag">${tg}</span><div class="media-card-title">${item.title}</div></div>`; }
        card.onclick = () => { window.location.hash = `#/midia/${item.id}`; openDetails(item); };
        if (item.type === 'movie') mc.appendChild(card); else sc.appendChild(card);
    });
    renderContinueWatching();
    if (mediaCatalog.length > 0 && !activeItem) setHero(mediaCatalog[0]);
}

function setHero(item) {
    activeItem = item;
    document.getElementById('heroTitle').innerText = item.title;
    document.getElementById('heroDesc').innerText = item.description;
    const gs = getItemGenres(item), tl = item.type==='movie'?'🎬 FILME':'📺 SÉRIE';
    document.getElementById('heroMeta').innerHTML = `<strong>${tl}</strong>${item.year?` <span class="dot">•</span> ${item.year}`:''}${item.duration?` <span class="dot">•</span> ⏱️ ${item.duration}`:''}${gs.length>0?` <span class="dot">•</span> ${gs.slice(0,3).join(', ')}`:''}`;
    const bd = getBackdropUrl(item); if (bd) document.getElementById('heroBackdrop').style.backgroundImage = `url('${bd}')`;
    document.getElementById('heroPlayBtn').onclick = () => { if (item.type==='movie'&&item.videoUrl) { saveContinueWatching(item,item.duration||'1h 30m'); playVideo(item.videoUrl,item.title,'Filme'); } else openDetails(item); };
    document.getElementById('heroInfoBtn').onclick = () => openDetails(item);
}

// ========== DETAILS ==========
function openDetails(item) {
    activeItem = item;
    const bd = getBackdropUrl(item), ba = document.getElementById('detailBackdropArea');
    if (bd) ba.style.backgroundImage = `url('${bd}')`; else ba.style.background = 'linear-gradient(135deg,#1a1a1a,#2a1a1a)';
    const ps = getPosterUrl(item), dp = document.getElementById('detailPoster');
    if (ps) { dp.src = ps; dp.style.display = 'block'; } else dp.style.display = 'none';
    document.getElementById('detailTitle').innerText = item.title;
    document.getElementById('detailMeta').innerText = `${item.type==='movie'?'FILME':'SÉRIE'} • ${item.year}${item.duration?' • ⏱️ '+item.duration:''}`;
    const gd = document.getElementById('detailGenres'); gd.innerHTML = '';
    getItemGenres(item).forEach(g => { const b = document.createElement('span'); b.style.cssText='padding:5px 12px;background:rgba(229,9,20,0.15);border:1px solid var(--primary-color);border-radius:14px;font-size:10px;font-weight:700;color:var(--primary-color);text-transform:uppercase;'; b.textContent=g; gd.appendChild(b); });
    document.getElementById('detailDesc').innerText = item.description;
    if (item.type==='movie') {
        document.getElementById('detailMovieArea').classList.remove('hidden'); document.getElementById('detailSerieArea').classList.add('hidden');
        document.getElementById('btnPlayMovieFile').onclick = () => { saveContinueWatching(item,item.duration||'1h 30m'); playVideo(item.videoUrl,item.title,'Filme'); };
    } else {
        document.getElementById('detailMovieArea').classList.add('hidden'); document.getElementById('detailSerieArea').classList.remove('hidden');
        const tabs = document.getElementById('seasonTabs'); tabs.innerHTML = "";
        (item.seasons||[]).forEach((s,idx) => {
            const tab = document.createElement('div'); tab.className = `season-tab ${idx===0?'active':''}`;
            tab.innerText = `Temporada ${idx+1}`;
            tab.onclick = () => { document.querySelectorAll('.season-tab').forEach(t=>t.classList.remove('active')); tab.classList.add('active'); if (s.seasonCoverUrl?.trim()) ba.style.backgroundImage=`url('${s.seasonCoverUrl}')`; else ba.style.backgroundImage=bd?`url('${bd}')`:``; renderEpisodesList(s.episodes||[],idx,s,item); };
            tabs.appendChild(tab);
        });
        if (item.seasons?.length > 0) { const fs = item.seasons[0]; if (fs.seasonCoverUrl?.trim()) ba.style.backgroundImage=`url('${fs.seasonCoverUrl}')`; renderEpisodesList(fs.episodes||[],0,fs,item); }
    }
    document.getElementById('detailsModal').classList.remove('hidden');
}

function renderEpisodesList(eps, si, sd, ser) {
    const c = document.getElementById('episodesListContainer'); c.innerHTML = "";
    eps.forEach((ep,idx) => {
        const d = document.createElement('div'); d.className = 'episode-card'; d.tabIndex = 0;
        const th = getEpisodeThumb(ep,sd,ser), dur = ep.duration?`<span style="color:#aaa;font-size:10px;margin-left:6px;">⏱️ ${ep.duration}</span>`:'';
        d.onclick = () => { document.getElementById('detailsModal').classList.add('hidden'); saveContinueWatching(activeItem,`T${si+1} E${idx+1}`); playVideo(ep.videoUrl,activeItem.title,`T${si+1} E${idx+1} - ${ep.title}`); };
        d.innerHTML = `<div class="episode-thumb"><img src="${th||'https://via.placeholder.com/150x90?text=?'}" onerror="this.src='https://via.placeholder.com/150x90?text=?'"></div><div style="flex:1;"><div style="font-size:12px;font-weight:800;">T${si+1} E${idx+1} - ${ep.title||'Sem Título'}${dur}</div><span style="font-size:10px;color:var(--primary-color);font-weight:700;">▶ Assistir</span></div>`;
        c.appendChild(d);
    });
}

// ========== PLAYER ==========
function isPlayerOpen() { return !document.getElementById('playerModal').classList.contains('hidden'); }
function isInFullscreen() { return !!(document.fullscreenElement||document.webkitFullscreenElement||document.mozFullScreenElement||document.msFullscreenElement); }
function showPlayerControls() { if (!isPlayerOpen()) return; playerControls.classList.remove('is-hidden'); playerBox.classList.remove('cursor-hidden'); clearTimeout(controlsHideTimer); clearTimeout(cursorHideTimer); controlsHideTimer=setTimeout(()=>playerControls.classList.add('is-hidden'),4000); if (!('ontouchstart' in window)) cursorHideTimer=setTimeout(()=>playerBox.classList.add('cursor-hidden'),3500); }
function forceShowControls() { if (!isPlayerOpen()) return; playerControls.classList.remove('is-hidden'); playerBox.classList.remove('cursor-hidden'); clearTimeout(controlsHideTimer); clearTimeout(cursorHideTimer); }
function enableNotificationBlocker() { if (notificationBlockerActive) return; notificationBlockerActive=true; if (!originalWindowOpen) originalWindowOpen=window.open; window.open=function(){return null;}; if ('Notification' in window) try{Notification.requestPermission=function(){return Promise.resolve('denied');}}catch(e){} if ('PushManager' in window) try{PushManager.prototype.subscribe=function(){return Promise.reject(new Error('Blocked'));}}catch(e){} }
function disableNotificationBlocker() { notificationBlockerActive=false; if (originalWindowOpen){window.open=originalWindowOpen;originalWindowOpen=null;} }

window.addEventListener('blur',()=>{ if (!isPlayerOpen()) return; setTimeout(()=>{ if (document.activeElement?.tagName==='IFRAME') { if (isInFullscreen()) try{document.exitFullscreen?.()??document.webkitExitFullscreen?.()}catch(e){} setTimeout(()=>{window.focus();forceShowControls();showPlayerControls();},150); } },100); });
window.addEventListener('focus',()=>{if(isPlayerOpen()){forceShowControls();showPlayerControls();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&isPlayerOpen()){forceShowControls();showPlayerControls();}});
['mousemove','mousedown','click','touchstart','touchmove','pointerdown','keydown','wheel'].forEach(e=>{document.addEventListener(e,()=>{if(isPlayerOpen())showPlayerControls();},{passive:true,capture:true});});
playerBox.addEventListener('mousemove',showPlayerControls);
playerBox.addEventListener('touchstart',showPlayerControls,{passive:true});

function updateFullscreenButtonText() { const b=document.getElementById('btnToggleFullscreen'); if(b) b.title=isInFullscreen()?'Sair da Tela Cheia':'Tela Cheia'; }
['fullscreenchange','webkitfullscreenchange','mozfullscreenchange','MSFullscreenChange'].forEach(e=>{document.addEventListener(e,()=>{updateFullscreenButtonText();if(isPlayerOpen()){forceShowControls();showPlayerControls();}});});

document.getElementById('btnToggleFullscreen').onclick = (e) => { e.stopPropagation(); if (!isInFullscreen()){playerBox.requestFullscreen?.()??playerBox.webkitRequestFullscreen?.()??playerBox.msRequestFullscreen?.();}else{document.exitFullscreen?.()??document.webkitExitFullscreen?.()??document.msExitFullscreen?.();} showPlayerControls(); };

function playVideo(rawUrl, mainTitle, subTitle) {
    if (!rawUrl) { showMsg('Sem link de vídeo!','error'); return; }
    const url = formatVideoUrl(rawUrl);
    document.getElementById('playerTitleDisplay').innerText = mainTitle||'Assistindo';
    document.getElementById('playerSubDisplay').innerText = subTitle||'MasterFlix';
    const old = playerContainer.querySelector('iframe'); if (old) old.remove();
    playerLoading.classList.remove('hidden');
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.setAttribute('allowfullscreen','true'); iframe.setAttribute('webkitallowfullscreen','true');
    iframe.setAttribute('allow','autoplay; fullscreen; picture-in-picture; encrypted-media');
    iframe.setAttribute('referrerpolicy','no-referrer');
    iframe.style.cssText='width:100%;height:100%;border:none;';
    iframe.onload = () => setTimeout(()=>playerLoading.classList.add('hidden'),500);
    playerContainer.appendChild(iframe);
    document.getElementById('playerModal').classList.remove('hidden');
    enableNotificationBlocker(); updateFullscreenButtonText(); forceShowControls(); showPlayerControls();
    setTimeout(()=>playerLoading.classList.add('hidden'),5000);
}

function closePlayer() {
    clearTimeout(controlsHideTimer); clearTimeout(cursorHideTimer);
    if (isInFullscreen()) try{document.exitFullscreen?.()??document.webkitExitFullscreen?.()}catch(e){}
    const iframe = playerContainer.querySelector('iframe'); if (iframe) iframe.remove();
    playerLoading.classList.remove('hidden');
    document.getElementById('playerModal').classList.add('hidden');
    playerBox.classList.remove('cursor-hidden'); playerControls.classList.remove('is-hidden');
    disableNotificationBlocker();
}
document.getElementById('btnClosePlayer').onclick = (e) => { e.stopPropagation(); closePlayer(); };

// ========== FORM SUBMIT ==========
document.getElementById('mediaForm').onsubmit = async (e) => {
    e.preventDefault();
    if (selectedGenres.length===0) { showMsg('Selecione ao menos 1 gênero!','error'); return; }
    const editId = document.getElementById('editMediaId').value, type = document.getElementById('mediaType').value;
    let cv = document.getElementById('mediaCoverPreview').src, bd = document.getElementById('mediaBackdropPreview').src;
    if ((!cv||cv.includes('window.location'))&&editId) { const ex=mediaCatalog.find(m=>m.id===editId); if(ex) cv=ex.coverUrl; }
    if ((!bd||bd.includes('window.location'))&&editId) { const ex=mediaCatalog.find(m=>m.id===editId); if(ex) bd=ex.backdropUrl; }
    let payload = {type,genres:[...selectedGenres],category:selectedGenres[0],title:document.getElementById('mediaTitle').value.trim(),year:document.getElementById('mediaYear').value.trim(),duration:document.getElementById('mediaDuration').value.trim(),description:document.getElementById('mediaDesc').value.trim(),coverUrl:(cv&&!cv.includes('window.location'))?cv:'',backdropUrl:(bd&&!bd.includes('window.location'))?bd:''};
    if (type==='movie') payload.videoUrl=document.getElementById('movieVideoUrl').value.trim();
    else {
        const us=[]; for (let si=0;si<seasonsBuilder.length;si++) { const s=seasonsBuilder[si]; let sc=document.getElementById(`seasonCoverPrev_${si}`)?.src||(s.seasonCoverUrl||''); if(sc.includes('window.location'))sc=''; const ue=[]; for(let ei=0;ei<(s.episodes||[]).length;ei++){const ep=s.episodes[ei]; let et=document.getElementById(`epThumbPrev_${si}_${ei}`)?.src||(ep.thumbUrl||''); if(et.includes('window.location'))et=''; ue.push({title:document.getElementById(`epTitle_${si}_${ei}`)?.value?.trim()||`Episódio ${ei+1}`,duration:document.getElementById(`epDuration_${si}_${ei}`)?.value?.trim()||'',videoUrl:document.getElementById(`epVideoUrl_${si}_${ei}`)?.value?.trim()||'',thumbUrl:et});} us.push({seasonNumber:s.seasonNumber||si+1,seasonCoverUrl:sc,episodes:ue}); }
        payload.seasons = us;
    }
    try {
        if (editId) { await set(ref(rtdb,"catalog/"+editId),payload); showMsg('Atualizado!','success'); }
        else { await set(push(ref(rtdb,"catalog")),payload); showMsg('Publicado!','success'); }
        document.getElementById('creatorModal').classList.add('hidden'); document.getElementById('mediaForm').reset();
        document.getElementById('mediaCoverPreview').classList.add('hidden'); document.getElementById('mediaBackdropPreview').classList.add('hidden');
        seasonsBuilder=[]; selectedGenres=[]; await loadCatalog();
    } catch(err) { showMsg('Erro: '+err.message,'error'); }
};

// ========== ADMIN ==========
window.editMedia = (id) => {
    const i=mediaCatalog.find(m=>m.id===id); if(!i)return;
    document.getElementById('editMediaId').value=i.id;
    const ts=document.getElementById('mediaType'); ts.value=i.type; ts.disabled=true; ts.style.cursor='not-allowed'; ts.style.opacity='0.6'; ts.dispatchEvent(new Event('change'));
    selectedGenres=Array.isArray(i.genres)&&i.genres.length>0?[...i.genres]:(i.category?[i.category]:[]); renderGenreSelector();
    document.getElementById('mediaTitle').value=i.title; document.getElementById('mediaYear').value=i.year; document.getElementById('mediaDuration').value=i.duration||''; document.getElementById('mediaDesc').value=i.description; document.getElementById('movieVideoUrl').value=i.videoUrl||'';
    if(i.coverUrl){document.getElementById('mediaCoverPreview').src=i.coverUrl;document.getElementById('mediaCoverPreview').classList.remove('hidden');}
    if(i.backdropUrl){document.getElementById('mediaBackdropPreview').src=i.backdropUrl;document.getElementById('mediaBackdropPreview').classList.remove('hidden');}
    document.getElementById('creatorTitle').innerText="Editar Conteúdo";
    if(i.type==='serie'){seasonsBuilder=JSON.parse(JSON.stringify(i.seasons||[]));renderSeasonsBuilder();}
    document.getElementById('adminModal').classList.add('hidden'); document.getElementById('creatorModal').classList.remove('hidden');
};
window.deleteMedia = async (id) => { if(confirm("Apagar?")){ try{await remove(ref(rtdb,"catalog/"+id));showMsg('Removido!','success');loadCatalog();}catch(e){showMsg('Erro: '+e.message,'error');} } };

function renderAdminCatalogList() {
    const c=document.getElementById('adminCatalogList'), sv=normalizeText(document.getElementById('adminSearchInput').value); c.innerHTML="";
    mediaCatalog.forEach(i=>{ if(sv&&!normalizeText(i.title).includes(sv))return; const d=document.createElement('div');d.className='admin-item';
    d.innerHTML=`<div><strong style="font-size:13px;">${i.title}</strong><div style="font-size:10px;color:#aaa;">${i.type==='movie'?'Filme':'Série'} • ${getItemGenres(i).join(', ')}</div></div><div style="display:flex;gap:6px;"><button class="btn-secondary" style="font-size:11px;padding:5px 10px;" onclick="editMedia('${i.id}')">✏️</button><button class="btn-secondary" style="font-size:11px;padding:5px 10px;color:#ff5252;" onclick="deleteMedia('${i.id}')">🗑️</button></div>`;
    c.appendChild(d); });
}
document.getElementById('adminSearchInput').oninput = renderAdminCatalogList;
document.getElementById('btnCloseAdmin').onclick = () => document.getElementById('adminModal').classList.add('hidden');
document.getElementById('btnAddNewFromAdmin').onclick = () => { document.getElementById('adminModal').classList.add('hidden'); openCreator(); };

function openCreator() {
    document.getElementById('editMediaId').value=""; document.getElementById('mediaForm').reset();
    const ts=document.getElementById('mediaType'); ts.disabled=false; ts.style.cursor='pointer'; ts.style.opacity='1'; ts.dispatchEvent(new Event('change'));
    document.getElementById('movieVideoUrl').value=""; document.getElementById('mediaCoverPreview').classList.add('hidden'); document.getElementById('mediaBackdropPreview').classList.add('hidden');
    document.getElementById('creatorTitle').innerText="Publicar Conteúdo"; seasonsBuilder=[]; selectedGenres=[]; renderGenreSelector();
    document.getElementById('seasonsList').innerHTML=""; addSeason(); document.getElementById('creatorModal').classList.remove('hidden');
}

// ========== SUGGESTIONS (USER) ==========
document.getElementById('btnCloseSuggestion').onclick = () => document.getElementById('suggestionModal').classList.add('hidden');
document.getElementById('btnSendSuggestion').onclick = async () => {
    const user = auth.currentUser; if (!user) { showMsg('Faça login primeiro!','error'); return; }
    const text = document.getElementById('suggestionText').value.trim();
    if (!text) { showMsg('Escreva algo!','error'); return; }
    if (text.length < 5) { showMsg('Sugestão muito curta!','error'); return; }
    try {
        const userName = localStorage.getItem('masterflix_user_name') || user.email.split('@')[0];
        await set(push(ref(rtdb,"suggestions")), {
            userId: user.uid, userEmail: user.email, userName: userName,
            text: text, timestamp: Date.now()
        });
        document.getElementById('suggestionText').value = '';
        showMsg('Sugestão enviada! Obrigado! 💡','success');
        document.getElementById('suggestionModal').classList.add('hidden');
    } catch(e) { showMsg('Erro: '+e.message,'error'); }
};

// ========== SUGGESTIONS ADMIN ==========
document.getElementById('btnCloseSuggestionsAdmin').onclick = () => { exitSelectMode(); document.getElementById('suggestionsAdminModal').classList.add('hidden'); };

async function loadSuggestionsAdmin() {
    try {
        const snap = await get(ref(rtdb,"suggestions"));
        allSuggestions = [];
        if (snap.exists()) { const d = snap.val(); for (let k in d) allSuggestions.push({id:k,...d[k]}); }
        allSuggestions.sort((a,b) => (b.timestamp||0) - (a.timestamp||0));
        document.getElementById('suggestionsCountText').textContent = `${allSuggestions.length} sugestão(ões) recebida(s)`;
        renderSuggestionsList();
    } catch(e) { showMsg('Erro: '+e.message,'error'); }
}

function renderSuggestionsList() {
    const c = document.getElementById('suggestionsAdminList'); c.innerHTML = '';
    if (allSuggestions.length === 0) { c.innerHTML = '<p style="text-align:center;color:#666;padding:30px;">Nenhuma sugestão ainda.</p>'; return; }
    allSuggestions.forEach(s => {
        const d = document.createElement('div'); d.className = 'suggestion-box';
        const date = s.timestamp ? new Date(s.timestamp).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) : '?';
        const checkboxHtml = suggestionsSelectMode ? `<input type="checkbox" class="suggestion-checkbox" data-id="${s.id}" ${selectedSuggestionIds.has(s.id)?'checked':''}>` : '';
        const deleteBtn = !suggestionsSelectMode ? `<button class="btn-danger" style="font-size:10px;padding:4px 8px;" onclick="deleteSingleSuggestion('${s.id}')">🗑️</button>` : '';
        d.innerHTML = `<div class="sg-header"><div style="display:flex;align-items:center;gap:8px;">${checkboxHtml}<div><div class="sg-user">${s.userName||'Anônimo'}</div><div class="sg-email">${s.userEmail||''}</div></div></div><div style="display:flex;align-items:center;gap:6px;"><span class="sg-date">${date}</span>${deleteBtn}</div></div><div class="sg-text">${s.text}</div>`;
        if (suggestionsSelectMode) {
            const cb = d.querySelector('.suggestion-checkbox');
            if (cb) cb.onchange = () => { if (cb.checked) selectedSuggestionIds.add(s.id); else selectedSuggestionIds.delete(s.id); updateDeleteSelectedBtn(); };
        }
        c.appendChild(d);
    });
}

function updateDeleteSelectedBtn() {
    const btn = document.getElementById('btnDeleteSelectedSuggestions');
    if (selectedSuggestionIds.size > 0) btn.textContent = `🗑️ Apagar ${selectedSuggestionIds.size} Selecionado(s)`;
    else btn.textContent = '🗑️ Apagar Selecionados';
}

function enterSelectMode() {
    suggestionsSelectMode = true; selectedSuggestionIds.clear();
    document.getElementById('btnToggleSelectMode').classList.add('hidden');
    document.getElementById('btnDeleteSelectedSuggestions').classList.remove('hidden');
    document.getElementById('btnSelectAllSuggestions').classList.remove('hidden');
    document.getElementById('btnCancelSelectMode').classList.remove('hidden');
    renderSuggestionsList();
}

function exitSelectMode() {
    suggestionsSelectMode = false; selectedSuggestionIds.clear();
    document.getElementById('btnToggleSelectMode').classList.remove('hidden');
    document.getElementById('btnDeleteSelectedSuggestions').classList.add('hidden');
    document.getElementById('btnSelectAllSuggestions').classList.add('hidden');
    document.getElementById('btnCancelSelectMode').classList.add('hidden');
    renderSuggestionsList();
}

document.getElementById('btnToggleSelectMode').onclick = enterSelectMode;
document.getElementById('btnCancelSelectMode').onclick = exitSelectMode;

document.getElementById('btnSelectAllSuggestions').onclick = () => {
    if (selectedSuggestionIds.size === allSuggestions.length) { selectedSuggestionIds.clear(); }
    else { allSuggestions.forEach(s => selectedSuggestionIds.add(s.id)); }
    updateDeleteSelectedBtn(); renderSuggestionsList();
};

document.getElementById('btnDeleteSelectedSuggestions').onclick = async () => {
    if (selectedSuggestionIds.size === 0) { showMsg('Selecione ao menos 1!','error'); return; }
    if (!confirm(`Apagar ${selectedSuggestionIds.size} sugestão(ões)?`)) return;
    try {
        const promises = []; selectedSuggestionIds.forEach(id => promises.push(remove(ref(rtdb,"suggestions/"+id))));
        await Promise.all(promises);
        showMsg(`${selectedSuggestionIds.size} sugestão(ões) apagada(s)!`,'success');
        exitSelectMode(); await loadSuggestionsAdmin();
    } catch(e) { showMsg('Erro: '+e.message,'error'); }
};

window.deleteSingleSuggestion = async (id) => {
    if (!confirm('Apagar esta sugestão?')) return;
    try { await remove(ref(rtdb,"suggestions/"+id)); showMsg('Apagada!','success'); await loadSuggestionsAdmin(); }
    catch(e) { showMsg('Erro: '+e.message,'error'); }
};

// ========== STORAGE ==========
document.getElementById('btnCloseStorage').onclick = () => document.getElementById('storageModal').classList.add('hidden');

async function loadStorageInfo() {
    const container = document.getElementById('storageContent');
    container.innerHTML = '<p style="text-align:center;color:#aaa;">⏳ Calculando uso real...</p>';
    try {
        const rootSnap = await get(ref(rtdb));
        const rootData = rootSnap.exists() ? rootSnap.val() : {};
        const totalBytes = estimateJsonBytes(rootData);
        const catalogBytes = rootData.catalog ? estimateJsonBytes(rootData.catalog) : 0;
        const usersBytes = rootData.users ? estimateJsonBytes(rootData.users) : 0;
        const suggestionsBytes = rootData.suggestions ? estimateJsonBytes(rootData.suggestions) : 0;
        const otherBytes = Math.max(0, totalBytes - catalogBytes - usersBytes - suggestionsBytes);
        const catalogCount = rootData.catalog ? Object.keys(rootData.catalog).length : 0;
        const usersCount = rootData.users ? Object.keys(rootData.users).length : 0;
        const suggestionsCount = rootData.suggestions ? Object.keys(rootData.suggestions).length : 0;
        const pct = Math.min(100, (totalBytes / FIREBASE_RTDB_FREE_LIMIT_BYTES) * 100);
        let barColor = '#4caf50';
        if (pct > 70) barColor = '#ff9800';
        if (pct > 90) barColor = '#f44336';

        container.innerHTML = `
            <div style="margin-bottom: 18px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <span style="font-size:13px;font-weight:800;">Uso Total</span>
                    <span style="font-size:13px;font-weight:800;color:${barColor};">${pct.toFixed(2)}%</span>
                </div>
                <div class="storage-bar-outer"><div class="storage-bar-inner" style="width:${pct}%;background:${barColor};"></div></div>
                <div class="storage-info"><span>${formatBytes(totalBytes)} usado</span><span>${formatBytes(FIREBASE_RTDB_FREE_LIMIT_BYTES)} limite</span></div>
            </div>
            <h4 style="font-size:12px;font-weight:800;margin-bottom:10px;color:var(--primary-color);">📊 Detalhamento</h4>
            <div class="storage-detail-item"><span class="storage-label">🎬 Catálogo (${catalogCount} itens)</span><span class="storage-value">${formatBytes(catalogBytes)}</span></div>
            <div class="storage-detail-item"><span class="storage-label">👤 Usuários (${usersCount} contas)</span><span class="storage-value">${formatBytes(usersBytes)}</span></div>
            <div class="storage-detail-item"><span class="storage-label">💡 Sugestões (${suggestionsCount})</span><span class="storage-value">${formatBytes(suggestionsBytes)}</span></div>
            <div class="storage-detail-item"><span class="storage-label">📁 Outros</span><span class="storage-value">${formatBytes(otherBytes)}</span></div>
            <div class="storage-detail-item" style="border-top:1px solid rgba(255,255,255,0.1);padding-top:10px;"><span class="storage-label" style="font-weight:800;color:#fff;">TOTAL</span><span class="storage-value" style="color:${barColor};">${formatBytes(totalBytes)}</span></div>
            <div class="info-tip" style="margin-top:14px;">💡 Firebase RTDB (Spark/Free) permite até 1 GB de armazenamento. Imagens em Base64 ocupam bastante espaço. Considere usar URLs externas.</div>
        `;
    } catch(e) {
        container.innerHTML = `<p style="text-align:center;color:#ff5252;">❌ Erro ao calcular: ${e.message}</p>`;
    }
}

// ========== PROFILE ==========
document.getElementById('btnSaveProfile').onclick = async () => {
    const user = auth.currentUser; if (!user) return;
    if (!isTVDevice()) applyUserTheme(document.getElementById('themeColorPicker').value);
    const n=document.getElementById('profileNameInput').value.trim(), b=document.getElementById('profileBioInput').value.trim(), fg=document.getElementById('profileFavGenreInput').value;
    const ph=document.getElementById('profilePhotoPreview').src, bn=document.getElementById('profileBannerPreview').src;
    const data={name:n||'',bio:b||'',favGenre:fg||'Ação',photo:(ph&&!ph.includes('window.location'))?ph:'',banner:(bn&&!bn.includes('window.location'))?bn:''};
    try {
        await set(ref(rtdb,"users/"+user.uid),data);
        if(n) localStorage.setItem('masterflix_user_name',n); if(b) localStorage.setItem('masterflix_user_bio',b); if(fg) localStorage.setItem('masterflix_user_fav_genre',fg);
        if(data.photo) localStorage.setItem('masterflix_user_avatar',data.photo); if(data.banner) localStorage.setItem('masterflix_user_banner',data.banner);
        updateUserAvatarUI(data); showMsg('Perfil salvo!','success'); document.getElementById('profileModal').classList.add('hidden');
    } catch(e) { showMsg('Erro: '+e.message,'error'); }
};

async function loadUserProfile(user) { if(!user)return; try{const s=await get(ref(rtdb,"users/"+user.uid));if(s.exists())updateUserAvatarUI(s.val());else updateUserAvatarUI({});}catch(e){console.error(e);} }

function updateUserAvatarUI(data={}) {
    const un=data.name||localStorage.getItem('masterflix_user_name'), ub=data.bio||localStorage.getItem('masterflix_user_bio'), ug=data.favGenre||localStorage.getItem('masterflix_user_fav_genre');
    const av=data.photo||localStorage.getItem('masterflix_user_avatar'), bn=data.banner||localStorage.getItem('masterflix_user_banner');
    const user=auth.currentUser, letter=un?un.charAt(0).toUpperCase():(user?user.email.charAt(0).toUpperCase():'U');
    if(un){document.getElementById('profileNameDisplay').innerText=un;document.getElementById('profileNameInput').value=un;document.getElementById('sidebarUserName').innerText=un;}else if(user)document.getElementById('sidebarUserName').innerText=user.email.split('@')[0];
    if(user) document.getElementById('sidebarUserEmail').innerText=user.email;
    if(ub){document.getElementById('profileBioDisplay').innerText=`"${ub}"`;document.getElementById('profileBioInput').value=ub;}
    if(ug) document.getElementById('profileFavGenreInput').value=ug;
    if(bn){document.getElementById('profileBannerImg').src=bn;document.getElementById('profileBannerPreview').src=bn;document.getElementById('profileBannerPreview').classList.remove('hidden');}
    const sa=document.getElementById('sidebarAvatar'); sa.innerHTML='';
    if(av){
        document.getElementById('avatarImg').src=av;document.getElementById('avatarImg').classList.remove('hidden');document.getElementById('avatarText').classList.add('hidden');
        document.getElementById('profileAvatarBigImg').src=av;document.getElementById('profileAvatarBigImg').classList.remove('hidden');document.getElementById('profileAvatarBigText').classList.add('hidden');
        document.getElementById('profilePhotoPreview').src=av;document.getElementById('profilePhotoPreview').classList.remove('hidden');
        const img=document.createElement('img');img.src=av;sa.appendChild(img);
    } else {
        document.getElementById('avatarText').innerText=letter;document.getElementById('avatarImg').classList.add('hidden');document.getElementById('avatarText').classList.remove('hidden');
        document.getElementById('profileAvatarBigText').innerText=letter;document.getElementById('profileAvatarBigImg').classList.add('hidden');document.getElementById('profileAvatarBigText').classList.remove('hidden');
        sa.innerHTML=`<span>${letter}</span>`;
    }
}

async function handleLogout() { try{await signOut(auth);document.getElementById('profileModal').classList.add('hidden');closeSidebar();showMsg('Saiu!','success');}catch(e){showMsg('Erro: '+e.message,'error');} }
document.getElementById('btnLogout').onclick = handleLogout;

// ========== AUTH ==========
document.getElementById('toggleAuthMode').onclick = () => { isSignUpMode=!isSignUpMode; document.getElementById('authSubtitle').innerText=isSignUpMode?'Crie sua conta':'Entre na sua conta'; document.getElementById('btnAuthSubmit').innerText=isSignUpMode?'Cadastrar':'Entrar'; document.getElementById('toggleAuthMode').innerText=isSignUpMode?'Já tem conta? Entrar':'Não tem conta? Criar'; };

document.getElementById('authForm').onsubmit = async (e) => {
    e.preventDefault(); const email=document.getElementById('authEmail').value.trim(), pass=document.getElementById('authPassword').value;
    try { if(isSignUpMode){await createUserWithEmailAndPassword(auth,email,pass);showMsg('Conta criada!','success');}else{await signInWithEmailAndPassword(auth,email,pass);showMsg('Bem-vindo!','success');} document.getElementById('authOverlay').classList.add('hidden'); }
    catch(err) { showMsg('Erro: '+err.message,'error'); }
};

// ========== MODAL BUTTONS ==========
document.getElementById('btnOpenProfile').onclick = () => document.getElementById('profileModal').classList.remove('hidden');
document.getElementById('btnCloseProfile').onclick = () => document.getElementById('profileModal').classList.add('hidden');
document.getElementById('btnCloseCreator').onclick = () => document.getElementById('creatorModal').classList.add('hidden');
document.getElementById('btnCloseDetails').onclick = () => { window.location.hash=''; document.getElementById('detailsModal').classList.add('hidden'); };

// ========== INIT ==========
renderGenreSelector();

onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('authOverlay').classList.add('hidden');
        document.getElementById('profileEmailDisplay').innerText = user.email;
        loadUserProfile(user);
        isAdmin = user.email.toLowerCase() === EXCLUSIVE_ADMIN_EMAIL.toLowerCase();
        if (isAdmin) {
            document.getElementById('profileAdminBadge').classList.remove('hidden');
            document.getElementById('sidebarAdminItem').classList.remove('hidden');
            document.getElementById('sidebarCreatorItem').classList.remove('hidden');
            document.getElementById('sidebarSuggestionsAdminItem').classList.remove('hidden');
            document.getElementById('sidebarStorageItem').classList.remove('hidden');
        } else {
            document.getElementById('profileAdminBadge').classList.add('hidden');
            document.getElementById('sidebarAdminItem').classList.add('hidden');
            document.getElementById('sidebarCreatorItem').classList.add('hidden');
            document.getElementById('sidebarSuggestionsAdminItem').classList.add('hidden');
            document.getElementById('sidebarStorageItem').classList.add('hidden');
        }
        loadCatalog();
    } else {
        document.getElementById('authOverlay').classList.remove('hidden');
        isAdmin = false;
        document.getElementById('sidebarAdminItem').classList.add('hidden');
        document.getElementById('sidebarCreatorItem').classList.add('hidden');
        document.getElementById('sidebarSuggestionsAdminItem').classList.add('hidden');
        document.getElementById('sidebarStorageItem').classList.add('hidden');
    }
});
