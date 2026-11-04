// ===================================================================
// 교사 현황판 — 학생별 상태 실시간 표시, 이탈 시 알림
// ===================================================================
(function () {
  const M = window.MONITOR, $ = s => document.querySelector(s);
  let students = [], prev = {}, flashUntil = {}, soundOn = false, audio = null, connected = false, firstLoad = true;

  $('#modePill').className = 'pill ' + (Backend.mode === 'demo' ? 'demo' : 'live');
  $('#modePill').innerHTML = `<span class="dot"></span>${Backend.mode === 'demo' ? '데모 모드' : '실시간(Firebase)'}`;
  if (Backend.mode === 'demo') $('#demoHow').classList.remove('hidden');
  $('#cls').value = new URLSearchParams(location.search).get('c') || window.DEFAULT_CLASS_CODE;

  // 실제 화면에 보여줄 상태: 소식이 끊긴 학생은 '연결 끊김'
  function view(s) {
    const now = Date.now();
    if (s.status !== 'away' && now - (s.lastSeen || 0) > M.offlineAfterMs) return 'offline';
    return s.status || 'offline';
  }
  const LABEL = { on: '수업 중', blur: '주의 · 다른 창', away: '화면 이탈', offline: '연결 끊김' };
  const fmt = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`; };
  const hhmm = t => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function draw() {
    const now = Date.now(), cnt = { on: 0, blur: 0, away: 0, offline: 0 };
    const list = students.slice().sort((a, b) => String(a.num).localeCompare(String(b.num), 'ko', { numeric: true }));
    $('#grid').innerHTML = list.length ? list.map(s => {
      const v = view(s); cnt[v]++;
      const extra = (v === 'away' || v === 'blur') ? ` · ${fmt(now - s.since)}` : '';
      const fl = (flashUntil[s.id] || 0) > now ? ' flash' : '';
      return `<div class="st ${v}${fl}" id="st-${esc(s.id)}">
        <div class="who"><small>${esc(s.num)}</small>${esc(s.name)}</div>
        <div class="state">${LABEL[v]}${extra}</div>
        <div class="meta">이탈 ${s.awayCount || 0}회 · 누적 ${fmt(s.awayTotalMs || 0)}</div>
        <div class="meta">보는 곳: Theme ${esc(s.theme || '-')}</div></div>`;
    }).join('') : '<div class="empty">아직 접속한 학생이 없어요.<br>학생이 워크북에서 같은 수업 코드로 로그인하면 여기에 나타납니다.</div>';
    $('#summary').innerHTML = `<span class="chip on">수업 중<b>${cnt.on}</b></span><span class="chip away">화면 이탈<b>${cnt.away}</b></span>` +
      `<span class="chip blur">주의<b>${cnt.blur}</b></span><span class="chip off">연결 끊김<b>${cnt.offline}</b></span>`;
  }

  function onStudents(list) {
    students = list;
    // 새로 이탈한 학생 감지 → 알림
    for (const s of list) {
      const was = prev[s.id];
      if (!firstLoad && s.status === 'away' && was !== 'away') alertAway(s);
      prev[s.id] = s.status;
    }
    firstLoad = false;
    draw();
  }
  function alertAway(s) {
    const t = document.createElement('div'); t.className = 'toast';
    t.textContent = `🚨 ${s.num} ${s.name} 화면 이탈`;
    $('#toasts').appendChild(t); setTimeout(() => t.remove(), 6000);
    if (soundOn) beep();
    flashUntil[s.id] = Date.now() + 8000;
  }
  function beep() {
    try {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
      g.gain.setValueAtTime(0.0001, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.3, audio.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.5); o.start(); o.stop(audio.currentTime + 0.5);
    } catch (e) {}
  }
  function onEvents(list) {
    const word = { join: '접속', away: '화면 이탈', back: '복귀', blur: '주의(다른 창)', offline: '연결 끊김' };
    $('#log').innerHTML = list.map(e => `<li><time>${hhmm(e.at)}</time><span>${esc(e.num)} ${esc(e.name)}</span>` +
      `<span class="${e.type}">${word[e.type] || e.type}${e.type === 'back' && e.durMs != null ? ` (${fmt(e.durMs)})` : ''}</span></li>`).join('');
  }

  async function connect() {
    if (connected) { location.search = '?c=' + encodeURIComponent($('#cls').value.trim()); return; }
    await Backend.init($('#cls').value.trim());
    Backend.watchStudents(onStudents); Backend.watchEvents(onEvents); connected = true;
    $('#connect').textContent = '다른 반으로 전환';
  }
  $('#connect').addEventListener('click', connect);
  $('#sound').addEventListener('click', () => {
    soundOn = !soundOn;
    if (soundOn && !audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    $('#sound').classList.toggle('sound-on', soundOn); $('#sound').textContent = soundOn ? '🔔 알림음 켜짐' : '🔕 알림음 켜기';
    if (soundOn) beep();
  });
  $('#reset').addEventListener('click', async () => {
    if (!connected) return;
    $('#reset').textContent = '한 번 더 누르면 초기화';
    if ($('#reset').dataset.armed) { await Backend.reset(); prev = {}; $('#reset').dataset.armed = ''; $('#reset').textContent = '기록 초기화'; return; }
    $('#reset').dataset.armed = '1'; setTimeout(() => { $('#reset').dataset.armed = ''; $('#reset').textContent = '기록 초기화'; }, 3000);
  });
  setInterval(draw, 1000);
  connect();
})();
