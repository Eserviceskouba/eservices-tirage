// ===== STATE =====
let participants = [];
let lastWinners = [];
const urlParams = new URLSearchParams(window.location.search);

// ===== ACCUEIL (clic sur le logo) =====
function goHome() {
  document.querySelector('[data-tab="import"]').click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== ONGLETS =====
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'participants') renderParticipants();
    if (tab.dataset.tab === 'tirage') updateTirageCount();
  });
});

// ===== TOGGLE MOT-CLÉ =====
document.getElementById('useKeyword').addEventListener('change', function () {
  document.getElementById('keywordDiv').style.display = this.checked ? 'block' : 'none';
});

// ===== AJOUTER LES PARTICIPANTS =====
function addParticipants(parsed) {
  const removeDuplicates = document.getElementById('removeDuplicates').checked;
  const removeEmpty = document.getElementById('removeEmpty').checked;
  const useKeyword = document.getElementById('useKeyword').checked;
  const keyword = document.getElementById('keywordInput').value.trim().toLowerCase();

  let added = 0;
  let skipped = 0;

  parsed.forEach(p => {
    if (!p || !p.nom) { skipped++; return; }
    if (removeEmpty && p.nom.trim() === '') { skipped++; return; }
    if (useKeyword && keyword) {
      const fullText = (p.nom + ' ' + p.commentaire).toLowerCase();
      if (!fullText.includes(keyword)) { skipped++; return; }
    }
    if (removeDuplicates) {
      const nomNorm = p.nom.trim().toLowerCase();
      if (participants.some(ex => ex.nom.trim().toLowerCase() === nomNorm)) {
        skipped++;
        return;
      }
    }
    participants.push({ id: Date.now() + Math.random(), nom: p.nom.trim(), commentaire: p.commentaire.trim() });
    added++;
  });

  showImportStatus(added, skipped);
  updateParticipantCount();
}

function showImportStatus(added, skipped) {
  const el = document.getElementById('importStatus');
  const text = document.getElementById('importStatusText');
  el.classList.remove('hidden', 'success', 'error');
  if (added > 0) {
    el.classList.add('success');
    text.textContent = `✅ ${added} participant(s) importé(s) avec succès${skipped > 0 ? ` (${skipped} ignoré(s))` : ''}`;
    showToast(`✅ ${added} participants importés !`);
  } else {
    el.classList.add('error');
    text.textContent = `❌ Aucun participant ajouté. ${skipped > 0 ? `${skipped} ligne(s) ignorée(s).` : ''}`;
  }
  setTimeout(() => el.classList.add('hidden'), 5000);
}

function updateParticipantCount() {
  document.getElementById('participantCount').textContent = `${participants.length} participant(s) importé(s)`;
}

// ===== AFFICHER LES PARTICIPANTS =====
function renderParticipants(filter = '') {
  const list = document.getElementById('participantsList');
  document.getElementById('participantCount').textContent = `${participants.length} participant(s) importé(s)`;

  const filtered = filter
    ? participants.filter(p => p.nom.toLowerCase().includes(filter.toLowerCase()) || p.commentaire.toLowerCase().includes(filter.toLowerCase()))
    : participants;

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${participants.length === 0 ? '👥' : '🔍'}</div>
        <p>${participants.length === 0 ? 'Aucun participant pour l\'instant' : 'Aucun résultat'}</p>
        <p class="empty-hint">${participants.length === 0 ? 'Allez dans l\'onglet "Importer" pour ajouter des participants' : 'Essayez un autre terme de recherche'}</p>
      </div>`;
    return;
  }

  list.innerHTML = filtered.map((p, i) => `
    <div class="participant-item">
      <div class="participant-num">${i + 1}</div>
      <div class="participant-info">
        <div class="participant-name">${escapeHTML(p.nom)}</div>
        ${p.commentaire ? `<div class="participant-comment">${escapeHTML(p.commentaire)}</div>` : ''}
      </div>
      <button class="participant-delete" onclick="deleteParticipant('${p.id}')" title="Supprimer">✕</button>
    </div>
  `).join('');
}

function filterParticipants() {
  renderParticipants(document.getElementById('searchParticipants').value);
}

function deleteParticipant(id) {
  participants = participants.filter(p => String(p.id) !== String(id));
  renderParticipants(document.getElementById('searchParticipants').value);
  updateParticipantCount();
}

function clearAll() {
  if (participants.length === 0) return;
  if (confirm(`Supprimer tous les ${participants.length} participants ?`)) {
    participants = [];
    renderParticipants();
    showToast('🗑️ Liste effacée');
  }
}

// ===== TIRAGE =====
function updateTirageCount() {
  const el = document.getElementById('tirageCount');
  el.textContent = participants.length > 0
    ? `${participants.length} participant(s) prêt(s) pour le tirage`
    : 'Aucun participant importé';
}

function lancerTirage() {
  if (participants.length === 0) {
    showToast('⚠️ Importez des participants d\'abord !');
    return;
  }

  const nbGagnants = parseInt(document.getElementById('nbGagnants').value) || 1;
  const allowRepeat = document.getElementById('allowRepeat').checked;

  if (!allowRepeat && nbGagnants > participants.length) {
    showToast(`⚠️ Pas assez de participants (${participants.length}) pour ${nbGagnants} gagnants`);
    return;
  }

  const btn = document.getElementById('btnTirage');
  btn.disabled = true;
  btn.classList.add('spinning');
  document.getElementById('resultsContainer').style.display = 'none';

  const screen = document.getElementById('machineScreen');
  screen.innerHTML = `
    <div class="machine-rolling">
      <div style="font-size:0.8rem;opacity:0.7;color:white;margin-bottom:8px">Tirage en cours...</div>
      <div class="rolling-name" id="rollingName">🎲</div>
    </div>`;

  let frame = 0;
  const totalFrames = 60;
  const rollingEl = document.getElementById('rollingName');

  const interval = setInterval(() => {
    const random = participants[Math.floor(Math.random() * participants.length)];
    rollingEl.textContent = random.nom;
    frame++;
    if (frame >= totalFrames) {
      clearInterval(interval);
      finalizeTirage(nbGagnants, allowRepeat);
    }
  }, 50);
}

function finalizeTirage(nbGagnants, allowRepeat) {
  const pool = [...participants];
  const winners = [];

  for (let i = 0; i < nbGagnants; i++) {
    if (pool.length === 0) break;
    const idx = Math.floor(Math.random() * pool.length);
    winners.push(pool[idx]);
    if (!allowRepeat) pool.splice(idx, 1);
  }

  lastWinners = winners;

  const screen = document.getElementById('machineScreen');
  if (winners.length === 1) {
    screen.innerHTML = `
      <div class="machine-result">
        <div class="result-label">🏆 GAGNANT</div>
        <div class="result-name">${escapeHTML(winners[0].nom)}</div>
      </div>`;
  } else {
    screen.innerHTML = `
      <div class="machine-result">
        <div class="result-label">🏆 ${winners.length} GAGNANTS</div>
        <div style="color:white;font-size:1.1rem;font-weight:700;margin-top:8px">
          ${winners.map(w => escapeHTML(w.nom)).join(', ')}
        </div>
      </div>`;
  }

  const resultsList = document.getElementById('winnersList');
  const medals = ['🥇', '🥈', '🥉'];
  resultsList.innerHTML = winners.map((w, i) => `
    <div class="winner-item">
      <span class="winner-rank">${medals[i] || '🏅'}</span>
      <div>
        <div class="winner-item-name">${escapeHTML(w.nom)}</div>
        ${w.commentaire ? `<div class="winner-item-comment">"${escapeHTML(w.commentaire)}"</div>` : ''}
      </div>
    </div>
  `).join('');

  document.getElementById('resultsContainer').style.display = 'block';

  const btn = document.getElementById('btnTirage');
  btn.disabled = false;
  btn.classList.remove('spinning');

  const date = new Date().toLocaleString('fr-FR');
  setTimeout(() => showWinnerModal(winners, date), 500);
}

function nouveauTirage() {
  document.getElementById('resultsContainer').style.display = 'none';
  document.getElementById('machineScreen').innerHTML = `
    <div class="machine-idle">
      <div class="machine-icon">🎰</div>
      <p>Prêt pour le tirage</p>
    </div>`;
}

// ===== MODAL GAGNANT =====
function showWinnerModal(winners, date) {
  const modal = document.getElementById('winnerModal');
  modal.style.display = 'flex';

  const namesEl = document.getElementById('modalWinnerNames');
  namesEl.innerHTML = winners.map(w => `<div class="winner-name-item">🏆 ${escapeHTML(w.nom)}</div>`).join('');
  document.getElementById('winnerMeta').textContent = `${date} · ${participants.length} participants`;

  launchConfetti();
}

function closeModal() {
  document.getElementById('winnerModal').style.display = 'none';
}

// ===== CONFETTI =====
function launchConfetti() {
  const container = document.getElementById('confettiContainer');
  container.innerHTML = '';
  const colors = ['#6c63ff', '#a855f7', '#f59e0b', '#22c55e', '#ef4444', '#3b82f6', '#ec4899'];

  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('div');
    piece.classList.add('confetti-piece');
    const color = colors[Math.floor(Math.random() * colors.length)];
    const shape = Math.random() > 0.5 ? '50%' : '2px';
    piece.style.cssText = `
      left: ${Math.random() * 100}%;
      background: ${color};
      border-radius: ${shape};
      width: ${6 + Math.random() * 10}px;
      height: ${6 + Math.random() * 10}px;
      animation-duration: ${1.5 + Math.random() * 2}s;
      animation-delay: ${Math.random() * 0.8}s;
    `;
    container.appendChild(piece);
  }
}

// ===== BOÎTE MAGIQUE (détection auto) =====
function detectPlatform() {
  const url = document.getElementById('magicUrl').value.trim().toLowerCase();
  const detect = document.getElementById('magicDetect');
  const hint = document.getElementById('magicHint');
  const icons = document.querySelectorAll('.magic-icon');

  icons.forEach(i => i.classList.remove('active'));
  hint.className = 'magic-hint';

  if (!url) {
    detect.textContent = '🔗';
    hint.textContent = '';
    return null;
  }

  let platform = null;

  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    platform = 'youtube';
    detect.textContent = '▶️';
    icons[0].classList.add('active');
    hint.textContent = '✅ Vidéo YouTube détectée';
    hint.classList.add('ok');
  } else if (url.includes('facebook.com') || url.includes('fb.watch')) {
    platform = 'facebook';
    detect.textContent = '📘';
    icons[1].classList.add('active');
    setConnHint(hint, 'metaConnected', 'Facebook');
  } else if (url.includes('instagram.com')) {
    platform = 'instagram';
    detect.textContent = '📸';
    icons[2].classList.add('active');
    setConnHint(hint, 'metaConnected', 'Instagram');
  } else {
    detect.textContent = '❓';
    hint.textContent = 'Lien non reconnu — collez un lien YouTube, Facebook ou Instagram';
    hint.classList.add('warn');
  }

  return platform;
}

// Affiche un message selon l'état de connexion (boîte magique)
function setConnHint(hint, connFlag, name) {
  if (window[connFlag]) {
    hint.textContent = `✅ ${name} détecté — compte connecté, prêt`;
    hint.classList.add('ok');
  } else {
    hint.textContent = `🔒 ${name} détecté — connexion requise (vos propres publications)`;
    hint.classList.add('warn');
  }
}

async function importMagic() {
  const url = document.getElementById('magicUrl').value.trim();
  if (!url) { showToast('⚠️ Collez un lien d\'abord'); return; }

  const platform = detectPlatform();
  if (!platform) {
    showToast('❌ Lien non reconnu. Utilisez YouTube, Facebook ou Instagram.');
    return;
  }

  const names = { youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram' };

  // Facebook / Instagram : pas de lien direct → on dirige vers le sélecteur de publication
  if (platform === 'facebook' || platform === 'instagram') {
    if (!window.metaConnected) {
      showToast('👇 Connectez votre compte dans la section ci-dessous');
      document.querySelector('.meta-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    // Connecté : basculer sur la bonne plateforme et faire défiler vers le sélecteur
    switchMetaPlatform(platform);
    document.querySelector('.meta-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast(`👇 Choisissez votre publication ${names[platform]} ci-dessous`);
    return;
  }

  const btn = document.getElementById('magicBtn');
  const progress = document.getElementById('magicProgress');
  const progressText = document.getElementById('magicProgressText');
  const countEl = document.getElementById('magicCount');

  btn.disabled = true;
  progress.classList.remove('hidden');

  const endpoints = { youtube: '/api/youtube/comments' };

  progressText.textContent = `Connexion à ${names[platform]}...`;

  try {
    const response = await fetch(endpoints[platform], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ url, max: 1000000 })
    });

    const data = await response.json();

    if (response.status === 401 && data.need_auth) {
      progress.classList.add('hidden');
      btn.disabled = false;
      showToast('👇 Connectez votre compte dans la section ci-dessous');
      document.querySelector('.meta-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!response.ok || data.error) throw new Error(data.error || 'Erreur inconnue');

    // Remplacer la liste (nouveau tirage = nouvelle publication)
    participants = [];
    addParticipants(data.comments);

    countEl.textContent = `✅ ${data.total} participants chargés depuis ${names[platform]}`;
    showToast(`✅ ${data.total} commentaires récupérés !`);

    // Basculer directement vers l'onglet Tirage
    if (participants.length > 0) {
      setTimeout(() => {
        document.querySelector('[data-tab="tirage"]').click();
      }, 800);
    }

  } catch (err) {
    showToast(`❌ ${err.message}`);
    countEl.textContent = 'Échec du chargement';
  } finally {
    btn.disabled = false;
    progress.classList.add('hidden');
  }
}

// ===== AUTH META (Facebook/Instagram) =====
async function checkMetaAuth() {
  try {
    const r = await fetch('/auth/status');
    const data = await r.json();
    updateMetaUI(data.connected, data.name || '', data.system);
  } catch {}
}

function updateMetaUI(connected, name, system) {
  window.metaConnected = connected;
  if (document.getElementById('magicUrl')?.value) detectPlatform();
  const badge = document.getElementById('metaBadge');
  const notConn = document.getElementById('metaNotConnected');
  const conn = document.getElementById('metaConnectedPanel');
  const nameEl = document.getElementById('metaUserName');

  if (connected) {
    badge.textContent = '✅ Connecté';
    badge.classList.add('connected');
    notConn.style.display = 'none';
    conn.style.display = 'block';
    nameEl.textContent = name ? `Connecté en tant que ${name}` : 'Compte connecté';
    // Charger les pages/comptes pour la plateforme active
    switchMetaPlatform(window.metaPlatform || 'facebook');
  } else {
    badge.textContent = 'Non connecté';
    badge.classList.remove('connected');
    notConn.style.display = 'block';
    conn.style.display = 'none';
  }
}

// Client : connexion avec son propre compte Facebook/Instagram (OAuth)
function connectClient() {
  window.location.href = '/auth/facebook';
}

// Propriétaire : connexion par mot de passe (jeton système)
async function ownerLogin() {
  // Si déjà authentifié (session) → reconnexion directe
  try {
    const r = await fetch('/auth/reconnect').then(res => res.json());
    if (r.connected) {
      showToast('✅ Reconnecté');
      checkMetaAuth();
      return;
    }
  } catch {}

  const pwd = prompt('🔒 Mot de passe propriétaire (accès Facebook / Instagram) :');
  if (pwd === null || pwd === '') return;
  try {
    const res = await fetch('/auth/owner-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    });
    const data = await res.json();
    if (res.ok && data.connected) {
      showToast('✅ Connecté (propriétaire)');
      checkMetaAuth();
    } else {
      showToast(`❌ ${data.error || 'Mot de passe incorrect'}`);
    }
  } catch {
    showToast('❌ Erreur de connexion');
  }
}

async function disconnectMeta() {
  await fetch('/auth/logout');
  window.metaConnected = false;
  updateMetaUI(false, '');
  showToast('Déconnecté');
}

// ===== SÉLECTEUR META (page/compte → posts → tirage) =====
window.metaPlatform = 'facebook';

function switchMetaPlatform(platform) {
  window.metaPlatform = platform;
  document.getElementById('metaTabFb').classList.toggle('active', platform === 'facebook');
  document.getElementById('metaTabIg').classList.toggle('active', platform === 'instagram');
  document.getElementById('metaSelectLabel').textContent =
    platform === 'facebook' ? 'Choisissez votre page Facebook :' : 'Choisissez votre compte Instagram :';
  document.getElementById('metaPostsGrid').innerHTML = '';
  document.getElementById('metaPostsHint').textContent = '';
  loadMetaAccounts();
}

async function loadMetaAccounts() {
  const select = document.getElementById('metaAccountSelect');
  select.innerHTML = '<option value="">— Chargement... —</option>';

  try {
    let accounts = [];
    if (window.metaPlatform === 'facebook') {
      const data = await fetch('/api/facebook/pages').then(r => r.json());
      if (data.error) throw new Error(data.error);
      accounts = (data.pages || []).map(p => ({ value: p.id, label: `${p.name} (${p.fans} abonnés)`, page_id: p.id }));
    } else {
      const data = await fetch('/api/instagram/accounts').then(r => r.json());
      if (data.error) throw new Error(data.error);
      accounts = (data.accounts || []).map(a => ({ value: a.ig_id, label: `@${a.username}`, page_id: a.page_id, username: a.username }));
    }

    if (accounts.length === 0) {
      select.innerHTML = '<option value="">— Aucun compte trouvé —</option>';
      document.getElementById('metaPostsHint').textContent =
        window.metaPlatform === 'facebook'
          ? 'Aucune page Facebook trouvée sur ce compte.'
          : 'Aucun compte Instagram Pro lié à une page Facebook trouvé.';
      return;
    }

    window.metaAccounts = {};
    select.innerHTML = '<option value="">— Sélectionnez —</option>';
    accounts.forEach(a => {
      window.metaAccounts[a.value] = a;
      const opt = document.createElement('option');
      opt.value = a.value;
      opt.textContent = a.label;
      select.appendChild(opt);
    });
  } catch (err) {
    select.innerHTML = '<option value="">— Erreur —</option>';
    showToast(`❌ ${err.message}`);
  }
}

async function loadMetaPosts() {
  const select = document.getElementById('metaAccountSelect');
  const accId = select.value;
  const grid = document.getElementById('metaPostsGrid');
  const hint = document.getElementById('metaPostsHint');
  const loading = document.getElementById('metaPostsLoading');
  grid.innerHTML = '';
  hint.textContent = '';
  if (!accId) return;

  const acc = window.metaAccounts[accId];
  loading.classList.remove('hidden');

  try {
    let posts = [];
    if (window.metaPlatform === 'facebook') {
      const data = await fetch(`/api/facebook/posts?page_id=${encodeURIComponent(acc.page_id)}`).then(r => r.json());
      if (data.error) throw new Error(data.error);
      posts = (data.posts || []).map(p => ({
        id: p.id, text: p.message, date: p.date, image: p.image, count: p.comment_count,
        page_id: acc.page_id
      }));
    } else {
      const data = await fetch(`/api/instagram/media?ig_id=${encodeURIComponent(accId)}&page_id=${encodeURIComponent(acc.page_id)}`).then(r => r.json());
      if (data.error) throw new Error(data.error);
      posts = (data.media || []).map(m => ({
        id: m.id, text: m.caption, date: m.date, image: m.image, count: m.comment_count,
        page_id: acc.page_id
      }));
    }

    if (posts.length === 0) {
      hint.textContent = 'Aucune publication trouvée sur ce compte.';
      return;
    }

    // On affiche les 5 plus commentés, puis un bouton « Afficher plus »
    window.metaAllPosts = posts;
    renderMetaPosts(5);
    hint.textContent = 'Cliquez sur une publication pour lancer le tirage sur ses commentaires.';
  } catch (err) {
    showToast(`❌ ${err.message}`);
    hint.textContent = err.message;
  } finally {
    loading.classList.add('hidden');
  }
}

function buildPostCard(p) {
  const fallbackIcon = window.metaPlatform === 'facebook' ? '📘' : '📸';
  const card = document.createElement('div');
  card.className = 'post-card';
  card.innerHTML = `
    <div class="post-card-body">
      <div class="post-card-text">${escapeHTML(p.text)}</div>
      <div class="post-card-meta">
        <span class="post-card-date">${escapeHTML(p.date)}</span>
        <span class="post-card-count">💬 ${p.count}</span>
      </div>
    </div>`;
  if (p.image) {
    const im = document.createElement('img');
    im.className = 'post-card-img';
    im.src = p.image;
    im.onerror = () => {
      const ph = document.createElement('div');
      ph.className = 'post-card-noimg';
      ph.textContent = fallbackIcon;
      im.replaceWith(ph);
    };
    card.prepend(im);
  } else {
    const ph = document.createElement('div');
    ph.className = 'post-card-noimg';
    ph.textContent = fallbackIcon;
    card.prepend(ph);
  }
  card.onclick = () => loadCommentsFromPost(p);
  return card;
}

function renderMetaPosts(count) {
  const grid = document.getElementById('metaPostsGrid');
  const all = window.metaAllPosts || [];
  const shown = Math.min(count, all.length);
  grid.innerHTML = '';
  for (let i = 0; i < shown; i++) grid.appendChild(buildPostCard(all[i]));

  // Bouton « Afficher plus » s'il reste des posts
  const moreWrap = document.getElementById('metaShowMoreWrap');
  if (moreWrap) moreWrap.remove();
  if (shown < all.length) {
    const wrap = document.createElement('div');
    wrap.id = 'metaShowMoreWrap';
    wrap.className = 'meta-showmore-wrap';
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary';
    btn.textContent = `▼ Afficher plus (${all.length - shown} autres publications)`;
    btn.onclick = () => renderMetaPosts(all.length);
    wrap.appendChild(btn);
    grid.after(wrap);
  }
}

async function loadCommentsFromPost(post) {
  showToast('⏳ Récupération des commentaires...');
  try {
    const endpoint = window.metaPlatform === 'facebook'
      ? '/api/facebook/post_comments'
      : '/api/instagram/media_comments';
    const accId = document.getElementById('metaAccountSelect').value;
    const ownerUsername = window.metaAccounts?.[accId]?.username || '';
    const body = window.metaPlatform === 'facebook'
      ? { post_id: post.id, page_id: post.page_id, max: 2000 }
      : { media_id: post.id, page_id: post.page_id, owner_username: ownerUsername, max: 2000 };

    const data = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(r => r.json());

    if (data.error) throw new Error(data.error);

    participants = [];
    addParticipants(data.comments);
    const uniques = participants.length;
    if (uniques < data.total) {
      showToast(`✅ ${data.total} commentaires → ${uniques} participants uniques (doublons retirés)`);
    } else {
      showToast(`✅ ${data.total} commentaires importés !`);
    }
    if (participants.length > 0) {
      setTimeout(() => document.querySelector('[data-tab="tirage"]').click(), 900);
    }
  } catch (err) {
    showToast(`❌ ${err.message}`);
  }
}

// Vérifier l'auth au chargement + après OAuth redirect
checkMetaAuth();
if (urlParams.get('auth') === 'success') {
  showToast('✅ Compte connecté avec succès !');
  history.replaceState({}, '', '/');
} else if (urlParams.get('auth') === 'error') {
  showToast('❌ Connexion échouée. Réessayez.');
  history.replaceState({}, '', '/');
}

// ===== IMPORT YOUTUBE (carte dédiée) =====
async function importFromYoutube() {
  const url = document.getElementById('youtubeUrl').value.trim();
  const max = parseInt(document.getElementById('youtubeMax').value) || 1000000;
  if (!url) { showToast('⚠️ Collez un lien YouTube d\'abord'); return; }

  const btn = document.getElementById('btnYoutube');
  const progress = document.getElementById('youtubeProgress');
  const progressText = document.getElementById('youtubeProgressText');

  btn.disabled = true;
  progress.classList.remove('hidden');
  progressText.textContent = 'Connexion à YouTube...';

  try {
    const response = await fetch('/api/youtube/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, max })
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || 'Erreur inconnue');

    participants = [];
    addParticipants(data.comments);
    document.getElementById('youtubeUrl').value = '';
    showToast(`▶️ ${data.total} commentaires YouTube importés !`);
    if (participants.length > 0) {
      setTimeout(() => document.querySelector('[data-tab="tirage"]').click(), 700);
    }
  } catch (err) {
    showToast(`❌ ${err.message}`);
  } finally {
    btn.disabled = false;
    progress.classList.add('hidden');
  }
}

// ===== EXPORT =====
function exportResults() {
  if (lastWinners.length === 0) { showToast('Aucun résultat à exporter'); return; }

  const date = new Date().toLocaleString('fr-FR');
  const lines = [
    '🎰 RÉSULTATS DU TIRAGE AU SORT',
    `📅 Date : ${date}`,
    `👥 Participants : ${participants.length}`,
    `🏆 Gagnants : ${lastWinners.length}`,
    '',
    '--- GAGNANTS ---',
    ...lastWinners.map((w, i) => `${i + 1}. ${w.nom}${w.commentaire ? ' : ' + w.commentaire : ''}`),
    '',
    'Généré par TirageApp'
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tirage_${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📤 Résultats exportés !');
}

// ===== TOAST =====
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ===== UTILS =====
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
