// ===================================================================
// 필기(잉크) — S펜/마우스로 쓰고, 손가락은 기본적으로 스크롤
//   · 획은 벡터로 저장(영역 너비 기준 비율) → 화면을 돌려도 위치 유지
//   · 저장: student.js가 Ink.onSave로 받아 기기 + 서버(Firebase)에 저장
// ===================================================================
(function () {
  const Ink = { color: '#1f2328', tool: 'pen', finger: false, owner: 'anon', surfaces: [], undo: [],
    cache: {},              // key -> strokes (로그인 시 서버/기기에서 불러옴)
    onSave: null };         // (key, strokes) => void  저장 요청
  let penActive = false;                       // 펜이 닿아 있는 동안 손바닥(터치) 무시

  function Surface(el, key, readOnly) {
    const cv = document.createElement('canvas'); cv.className = 'ink'; el.appendChild(cv);
    const ctx = cv.getContext('2d');
    let strokes = (Ink.cache[key] || []).slice();
    let W = 1, cur = null, mode = null, lastY = 0;

    function size() {
      const dpr = window.devicePixelRatio || 1;
      W = el.clientWidth || 1;
      cv.width = Math.round(W * dpr); cv.height = Math.round(el.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); redraw();
    }
    function drawStroke(s) {
      const p = s.p; if (!p.length) return;
      ctx.strokeStyle = s.c; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (p.length === 1) { ctx.fillStyle = s.c; ctx.beginPath(); ctx.arc(p[0][0] * W, p[0][1] * W, s.w * W / 2, 0, 7); ctx.fill(); return; }
      for (let i = 1; i < p.length; i++) {
        ctx.lineWidth = s.w * W * (0.55 + 0.9 * (p[i][2] ?? 0.5));
        ctx.beginPath(); ctx.moveTo(p[i - 1][0] * W, p[i - 1][1] * W); ctx.lineTo(p[i][0] * W, p[i][1] * W); ctx.stroke();
      }
    }
    function redraw() { ctx.clearRect(0, 0, cv.width, cv.height); strokes.forEach(drawStroke); }
    function save() {
      const data = strokes.map(t => ({ c: t.c, w: t.w, p: t.p.map(q => q.map(v => Math.round(v * 1e4) / 1e4)) }));
      Ink.cache[key] = data;
      if (Ink.onSave) Ink.onSave(key, data);
    }
    function pt(e) {
      const r = cv.getBoundingClientRect();
      const pr = e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5;
      return [(e.clientX - r.left) / W, (e.clientY - r.top) / W, pr];
    }
    function eraseAt(q) {
      const R = 0.018, before = strokes.length;
      strokes = strokes.filter(s => !s.p.some(a => Math.hypot(a[0] - q[0], a[1] - q[1]) < R));
      if (strokes.length !== before) redraw();
    }

    if (readOnly) { cv.style.pointerEvents = 'none'; }
    cv.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch' && (!Ink.finger || penActive)) { mode = 'scroll'; lastY = e.clientY; return; }
      e.preventDefault(); cv.setPointerCapture(e.pointerId);
      if (e.pointerType === 'pen') penActive = true;
      Ink.undo.push({ surf: api, prev: strokes.slice() }); if (Ink.undo.length > 60) Ink.undo.shift();
      if (Ink.tool === 'eraser' || e.button === 5 || (e.buttons & 32)) { mode = 'erase'; eraseAt(pt(e)); }
      else { mode = 'draw'; cur = { c: Ink.color, w: 0.0042, p: [pt(e)] }; strokes.push(cur); }
    });
    cv.addEventListener('pointermove', e => {
      if (!mode) return;
      if (mode === 'scroll') { window.scrollBy(0, lastY - e.clientY); lastY = e.clientY; return; }
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs) {
        const q = pt(ev);
        if (mode === 'erase') eraseAt(q);
        else { cur.p.push(q); const n = cur.p.length; drawStroke({ c: cur.c, w: cur.w, p: cur.p.slice(n - 2) }); }
      }
    });
    const end = e => {
      if (e.pointerType === 'pen') penActive = false;
      if (mode === 'draw' || mode === 'erase') { if (mode === 'draw' && cur.p.length === 1) drawStroke(cur); save(); }
      mode = null; cur = null;
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);

    const api = { el, restore(prev) { strokes = prev; redraw(); save(); }, size };
    if (!readOnly) new ResizeObserver(size).observe(el);
    size();
    return api;
  }

  Ink.attach = (el, key) => { const s = Surface(el, key); Ink.surfaces.push(s); return s; };
  Ink.attachStatic = (el, key) => Surface(el, key, true);   // PDF 만들 때 (그리기만)
  Ink.reset = () => { Ink.surfaces = []; Ink.undo = []; };
  Ink.doUndo = () => { const u = Ink.undo.pop(); if (u && document.body.contains(u.surf.el)) u.surf.restore(u.prev); };
  window.Ink = Ink;
})();
