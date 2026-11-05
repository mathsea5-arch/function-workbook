// ===================================================================
// 필기(잉크) — S펜/마우스로 쓰고, 손가락은 기본적으로 스크롤
//   · 획은 벡터로 저장(영역 너비 기준 비율) → 화면을 돌려도 위치 유지
//   · 저장: student.js가 Ink.onSave로 받아 기기 + 서버(Firebase)에 저장
// ===================================================================
(function () {
  const Ink = { color: '#1f2328', tool: 'pen', finger: false, owner: 'anon', surfaces: [], undo: [], redo: [],
    width: 0.0042,          // 펜 굵기 (영역 너비 기준 비율)
    eraserR: 0.016,         // 지우개 반지름 (영역 너비 기준 비율)
    onHistory: null,        // 되돌리기/다시 실행 가능 여부가 바뀔 때 알림
    cache: {},              // key -> strokes (로그인 시 서버/기기에서 불러옴)
    onSave: null };         // (key, strokes) => void  저장 요청
  let penActive = false;                       // 펜이 닿아 있는 동안 손바닥(터치) 무시

  function Surface(el, key, readOnly) {
    const cv = document.createElement('canvas'); cv.className = 'ink'; el.appendChild(cv);
    const ctx = cv.getContext('2d');
    let strokes = (Ink.cache[key] || []).slice();
    let W = 1, cur = null, mode = null, lastY = 0, lastQ = null, erased = false;

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
    // 부분 지우개: 지우개가 지나간 자리(이전 위치 a → 지금 위치 b)에 닿은 부분만 잘라 냄
    function segDist(p, a, b) {
      const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
      return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    }
    function densify(p, step) {          // 점 사이가 멀면 중간 점을 채워 넣어 자를 수 있게
      const out = [p[0]];
      for (let i = 1; i < p.length; i++) {
        const a = p[i - 1], b = p[i], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step);
        for (let k = 1; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, (a[2] ?? 0.5) + ((b[2] ?? 0.5) - (a[2] ?? 0.5)) * k / n]);
        out.push(b);
      }
      return out;
    }
    function eraseAt(a, b) {
      const R = Ink.eraserR, out = []; let hit = false;
      for (const s of strokes) {
        const r = R + s.w / 2;
        if (!s.p.some((q, i) => segDist(q, a, b) < r + (i ? Math.hypot(q[0] - s.p[i - 1][0], q[1] - s.p[i - 1][1]) : 0))) { out.push(s); continue; }
        hit = true;
        let run = [];
        for (const q of densify(s.p, R / 3)) {
          if (segDist(q, a, b) < r) { if (run.length > 1) out.push({ c: s.c, w: s.w, p: run }); run = []; }
          else run.push(q);
        }
        if (run.length > 1) out.push({ c: s.c, w: s.w, p: run });
      }
      if (hit) { strokes = out; redraw(); erased = true; }
    }

    if (readOnly) { cv.style.pointerEvents = 'none'; }
    cv.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch' && (!Ink.finger || penActive)) { mode = 'scroll'; lastY = e.clientY; return; }
      e.preventDefault(); cv.setPointerCapture(e.pointerId);
      if (e.pointerType === 'pen') penActive = true;
      Ink.undo.push({ surf: api, prev: strokes.slice() }); if (Ink.undo.length > 60) Ink.undo.shift();
      if (Ink.tool === 'eraser' || e.button === 5 || (e.buttons & 32)) { mode = 'erase'; erased = false; lastQ = pt(e); eraseAt(lastQ, lastQ); }
      else { mode = 'draw'; cur = { c: Ink.color, w: Ink.width, p: [pt(e)] }; strokes.push(cur); }
    });
    cv.addEventListener('pointermove', e => {
      if (!mode) return;
      if (mode === 'scroll') { window.scrollBy(0, lastY - e.clientY); lastY = e.clientY; return; }
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs) {
        const q = pt(ev);
        if (mode === 'erase') { eraseAt(lastQ, q); lastQ = q; }
        else { cur.p.push(q); const n = cur.p.length; drawStroke({ c: cur.c, w: cur.w, p: cur.p.slice(n - 2) }); }
      }
    });
    const end = e => {
      if (e.pointerType === 'pen') penActive = false;
      if (mode === 'erase' && !erased) Ink.undo.pop();          // 아무것도 안 지웠으면 기록하지 않음
      else if (mode === 'draw' || mode === 'erase') { if (mode === 'draw' && cur.p.length === 1) drawStroke(cur); save(); Ink.redo = []; }
      if (mode === 'draw' || mode === 'erase') history();
      mode = null; cur = null;
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);

    const api = { el, get: () => strokes.slice(), restore(prev) { strokes = prev; redraw(); save(); }, size };
    if (!readOnly) new ResizeObserver(size).observe(el);
    size();
    return api;
  }

  Ink.attach = (el, key) => { const s = Surface(el, key); Ink.surfaces.push(s); return s; };
  Ink.attachStatic = (el, key) => Surface(el, key, true);   // PDF 만들 때 (그리기만)
  function history() { if (Ink.onHistory) Ink.onHistory(Ink.undo.length > 0, Ink.redo.length > 0); }
  Ink.reset = () => { Ink.surfaces = []; Ink.undo = []; Ink.redo = []; history(); };
  Ink.doUndo = () => {
    const u = Ink.undo.pop();
    if (u && document.body.contains(u.surf.el)) { Ink.redo.push({ surf: u.surf, prev: u.surf.get() }); u.surf.restore(u.prev); }
    history();
  };
  Ink.doRedo = () => {                                       // 앞으로 가기(다시 실행)
    const r = Ink.redo.pop();
    if (r && document.body.contains(r.surf.el)) { Ink.undo.push({ surf: r.surf, prev: r.surf.get() }); r.surf.restore(r.prev); }
    history();
  };
  window.Ink = Ink;
})();
