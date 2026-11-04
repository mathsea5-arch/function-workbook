// ===================================================================
// 학생 페이지 — 워크북 화면 + 화면 이탈 감지
// ===================================================================
(function () {
  const WB = window.WORKBOOK, M = window.MONITOR, $ = s => document.querySelector(s);
  let me = null, theme = WB.themes[0].id;

  // ---------------- 워크북 그리기 ----------------
  function themeHTML(t, pdf) {
    const h = [];
    h.push(`<div class="theme-header">[Theme ${t.id}] ${t.title}</div><div class="theme-range">${t.range}</div>`);
    if (t.id === WB.themes[0].id) h.push(`<div class="badge">🧭 단원 연결 지도</div><div class="card">${WB.linkMap}</div>`);
    h.push(`<div class="badge">① 개념 정리 — 빈칸을 S펜으로 채우세요</div><div class="concept write" data-k="${t.id}-concept">${t.concept}</div>`);
    for (const sec of t.sections) {
      h.push(`<div class="badge">${sec.title}</div>`);
      const its = sec.items;
      for (let i = 0; i < its.length; i++) {
        const it = its[i];
        if (it.type === 'tip') { h.push(`<div class="tip write" data-k="${t.id}-tip${i}">${it.html}</div>`); continue; }
        if (it.kind === 'half') {
          const pair = [it]; if (its[i + 1] && its[i + 1].type === 'q' && its[i + 1].kind === 'half') { pair.push(its[i + 1]); i++; }
          h.push(`<div class="pair">${pair.map(x => card(x, pdf)).join('')}${pair.length === 1 ? '<div></div>' : ''}</div>`); continue;
        }
        h.push(card(it, pdf));
      }
    }
    return h.join('');
  }
  const math = el => { if (window.renderMathInElement) renderMathInElement(el, { delimiters: [{ left: '$', right: '$', display: false }], throwOnError: false }); };
  function render() {
    const t = WB.themes.find(x => x.id === theme);
    Ink.reset();
    $('#wb').innerHTML = themeHTML(t, false);
    math($('#wb'));
    if (me) document.querySelectorAll('#wb .write').forEach(el => Ink.attach(el, el.dataset.k));   // 로그인 후에만 필기 가능
    document.querySelectorAll('#tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.id === theme));
    window.scrollTo(0, 0);
  }
  function card(it, pdf) {
    const ws = it.kind === 'ex' ? 'ws-ex' : it.kind === 'half' ? 'ws-fill' : 'ws-' + it.ws;
    return `<div class="card write ${it.kind}" data-k="${it.key}"><div class="label">[${it.label}]</div>` +
      `<img src="img/${it.key}.webp" alt="${it.label}"${pdf ? '' : ' loading="lazy"'}><div class="${ws}"></div></div>`;
  }
  $('#tabs').innerHTML = WB.themes.map(t => `<button class="tab" data-id="${t.id}">${t.id} ${({ '1-1': '함수의 뜻', '1-2': '여러 가지 함수', '2-1': '합성함수', '2-2': '역함수' }[t.id] || t.short)}</button>`).join('');
  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab'); if (!b) return;
    theme = b.dataset.id; render();
    if (me) Backend.updateStudent(me.sid, { theme, lastSeen: Date.now() });
  });

  // ---------------- 필기 도구 ----------------
  $('#tools').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'fingerBtn') { Ink.finger = !Ink.finger; b.classList.toggle('active', Ink.finger); b.textContent = Ink.finger ? '✋ 켬' : '✋ 끔'; return; }
    if (b.dataset.tool === 'undo') { Ink.doUndo(); return; }
    document.querySelectorAll('#tools .tool').forEach(x => x.classList.toggle('active', x === b));
    if (b.dataset.tool === 'eraser') Ink.tool = 'eraser'; else { Ink.tool = 'pen'; Ink.color = b.dataset.color; }
  });

  // ---------------- 로그인 ----------------
  const saved = (() => { try { return JSON.parse(localStorage.getItem('wb:me')); } catch (e) { return null; } })();
  $('#inClass').value = (saved && saved.cls) || window.DEFAULT_CLASS_CODE;
  if (saved) { $('#inNum').value = saved.num; $('#inName').value = saved.name; }
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const cls = $('#inClass').value.trim(), num = $('#inNum').value.trim(), name = $('#inName').value.trim();
    me = { cls, num, name, sid: num };
    try { localStorage.setItem('wb:me', JSON.stringify(me)); } catch (err) {}
    $('#loginForm .primary').textContent = '불러오는 중…'; $('#loginForm .primary').disabled = true;
    try {
      await Backend.init(cls);
      Ink.cache = await Backend.loadInk(me.sid);
      saveState('ok', '저장됨');
    } catch (err) {
      console.error(err); Ink.cache = {};
      saveState('err', '서버 연결 실패 · 기기에만 저장');
    }
    // 서버에 없는 필기는 이 기기에 남아 있던 백업으로 채움
    const local = readLocal();
    for (const k in local) if (!Ink.cache[k] || !Ink.cache[k].length) Ink.cache[k] = local[k];
    Ink.onSave = queueSave;
    $('#login').classList.add('hidden');
    render();
    startMonitor();
  });

  // ---------------- 필기 저장 (기기 백업 + 서버) ----------------
  const localKey = () => `wbbackup:${me.cls}:${me.sid}`;
  function readLocal() { try { return JSON.parse(localStorage.getItem(localKey())) || {}; } catch (e) { return {}; } }
  const timers = {}, pending = new Set();
  function queueSave(k, strokes) {
    if (Backend.mode !== 'demo') { try { const m = readLocal(); m[k] = strokes; localStorage.setItem(localKey(), JSON.stringify(m)); } catch (e) {} }
    pending.add(k); saveState('busy', '저장 중…');
    clearTimeout(timers[k]);
    timers[k] = setTimeout(() => flush(k), 1200);
  }
  async function flush(k) {
    try { await Backend.saveInk(me.sid, k, Ink.cache[k] || []); pending.delete(k); if (!pending.size) saveState('ok', '저장됨'); }
    catch (err) { console.error(err); saveState('err', '저장 실패 · 기기에만 저장'); setTimeout(() => flush(k), 8000); }
  }
  function saveState(cls, text) { const p = $('#savePill'); p.className = 'pill save ' + cls; p.textContent = (me ? me.num + ' ' + me.name + ' · ' : '') + (cls === 'ok' ? '✓ ' : cls === 'err' ? '⚠ ' : '') + text; }
  window.addEventListener('beforeunload', e => { if (pending.size) { pending.forEach(k => flush(k)); e.preventDefault(); e.returnValue = ''; } });

  // ---------------- PDF 다운로드 ----------------
  $('#pdfBtn').addEventListener('click', () => { if (me) $('#pdfDlg').classList.remove('hidden'); });
  $('#pdfCancel').addEventListener('click', () => $('#pdfDlg').classList.add('hidden'));
  $('#pdfDlg').addEventListener('click', e => { const b = e.target.closest('[data-scope]'); if (b) makePdf(b.dataset.scope); });

  async function makePdf(scope) {
    const ids = scope === 'all' ? WB.themes.map(t => t.id) : [theme];
    const prog = $('#pdfProg'); $('#pdfChoices').classList.add('hidden'); prog.classList.remove('hidden');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const PW = 210, PH = 297, MX = 12, MT = 12, MB = 12, CW = PW - MX * 2;
    let y = MT, first = true;
    const stage = document.createElement('div'); stage.className = 'pdf-stage'; document.body.appendChild(stage);
    try {
      const today = new Date().toLocaleDateString('ko-KR');
      for (let ti = 0; ti < ids.length; ti++) {
        const t = WB.themes.find(x => x.id === ids[ti]);
        prog.textContent = `PDF 만드는 중… (${ti + 1}/${ids.length}) Theme ${t.id}`;
        stage.innerHTML = (ti === 0 ? `<div class="pdf-title">${WB.title} — ${me.num} ${me.name} · ${today}</div>` : '') + themeHTML(t, true);
        math(stage);
        await Promise.all([...stage.querySelectorAll('img')].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        stage.querySelectorAll('.write').forEach(el => Ink.attachStatic(el, el.dataset.k));
        // 배지(소제목)는 다음 블록과 묶어서 쪽이 갈리지 않게
        const blocks = []; let carry = [];
        for (const el of stage.children) {
          if (el.classList.contains('badge') || el.classList.contains('theme-range') || el.classList.contains('pdf-title') || el.classList.contains('theme-header')) { carry.push(el); continue; }
          blocks.push([...carry, el]); carry = [];
        }
        if (carry.length) blocks.push(carry);
        if (!first) { pdf.addPage(); y = MT; }
        for (const grp of blocks) {
          const wrap = document.createElement('div'); wrap.className = 'pdf-block';
          grp[0].before(wrap); grp.forEach(el => wrap.appendChild(el));
          const cv = await html2canvas(wrap, { scale: 1.5, backgroundColor: '#ffffff', logging: false, useCORS: true });
          let w = CW, h = cv.height * CW / cv.width;
          const maxH = PH - MT - MB;
          if (h > maxH) { w = w * maxH / h; h = maxH; }
          if (y + h > PH - MB && y > MT) { pdf.addPage(); y = MT; }
          pdf.addImage(cv.toDataURL('image/jpeg', 0.85), 'JPEG', MX + (CW - w) / 2, y, w, h);
          y += h + 3;
        }
        first = false;
      }
      const name = `Function_Workbook_${me.num}${scope === 'all' ? '_all' : '_theme' + ids[0]}.pdf`;   // 기기에 따라 한글 파일명이 깨질 수 있어 영문 사용 (PDF 첫 줄에 학번·이름 표시)
      const url = URL.createObjectURL(pdf.output('blob'));
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      prog.textContent = '✓ 다운로드했어요. (다운로드 폴더 / 파일 앱 확인)';
    } catch (err) {
      console.error(err); prog.textContent = '⚠ PDF를 만들지 못했어요. 다시 시도해 주세요.';
    } finally {
      stage.remove();
      setTimeout(() => { $('#pdfDlg').classList.add('hidden'); $('#pdfChoices').classList.remove('hidden'); prog.classList.add('hidden'); }, 2500);
    }
  }

  // ---------------- 화면 이탈 감지 ----------------
  //  away : 탭 전환·다른 앱·홈 화면·화면 꺼짐 (document.hidden)
  //  blur : 화면은 보이지만 포커스를 잃음 (화면 분할로 다른 앱 사용, 알림창 등) → 주의
  let status = 'on', awayAt = 0, blurTimer = null, awayCount = 0;
  function set(st, extra) {
    status = st;
    const now = Date.now();
    Backend.updateStudent(me.sid, { name: me.name, num: me.num, status: st, since: now, lastSeen: now, theme, ...(extra && extra.patch) }, extra && extra.inc);
  }
  function log(type, durMs) {
    Backend.logEvent({ sid: me.sid, name: me.name, num: me.num, type, at: Date.now(), ...(durMs != null ? { durMs } : {}) });
  }
  function goAway() {
    if (status === 'away') return;
    clearTimeout(blurTimer); awayAt = Date.now(); awayCount++;
    set('away', { inc: { awayCount: 1 } }); log('away');
  }
  function comeBack() {
    if (status !== 'away') return;
    const dur = Date.now() - awayAt;
    set('on', { inc: { awayTotalMs: dur } }); log('back', dur);
    showBanner(`화면을 ${fmt(dur)} 동안 벗어났어요. 선생님께 기록되었습니다. (오늘 ${awayCount}회)`);
  }
  function startMonitor() {
    set(document.hidden ? 'away' : 'on'); log('join');
    document.addEventListener('visibilitychange', () => document.hidden ? goAway() : comeBack());
    window.addEventListener('blur', () => {
      if (document.hidden || status === 'away') return;
      clearTimeout(blurTimer);
      blurTimer = setTimeout(() => { if (!document.hasFocus() && !document.hidden && status === 'on') { set('blur'); log('blur'); } }, M.blurGraceMs);
    });
    window.addEventListener('focus', () => { clearTimeout(blurTimer); if (status === 'blur') set('on'); });
    window.addEventListener('pagehide', () => { if (status !== 'away') { goAway(); } });
    setInterval(() => { if (!document.hidden) Backend.updateStudent(me.sid, { lastSeen: Date.now() }); }, M.heartbeatMs);
  }

  function fmt(ms) { const s = Math.round(ms / 1000); return s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`; }
  function showBanner(t) { $('#bannerText').textContent = t; $('#banner').classList.remove('hidden'); }
  $('#bannerOk').addEventListener('click', () => $('#banner').classList.add('hidden'));

  render();
})();
