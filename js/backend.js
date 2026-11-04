// ===================================================================
// 저장소 계층 — 데모 모드(같은 브라우저) / Firebase(Firestore) 모드
// 학생·교사 페이지는 이 객체만 사용합니다.
//
//   students 문서: classes/{수업코드}/students/{학생ID}
//     { name, num, status: 'on'|'blur'|'away'|'offline', since, lastSeen,
//       awayCount, awayTotalMs, theme }
//   ink     문서: classes/{수업코드}/ink/{학생ID}__{문항키}
//     { sid, key, s: 필기 획(JSON 문자열), at }
//   events  문서: classes/{수업코드}/events/{자동ID}
//     { sid, name, num, type: 'join'|'away'|'back'|'blur'|'offline', at, durMs }
// ===================================================================
(function () {
  const FB_VER = '10.12.2';

  // ---------------- 데모 모드 ----------------
  function DemoBackend() {
    let cls, key, ch;
    const read = () => { try { return JSON.parse(localStorage.getItem(key)) || { students: {}, events: [] }; } catch (e) { return { students: {}, events: [] }; } };
    const write = (s) => { try { localStorage.setItem(key, JSON.stringify(s)); } catch (e) {} ch.postMessage('changed'); notify(); };
    const subs = [];
    const notify = () => { const s = read(); subs.forEach(f => f(s)); };
    return {
      mode: 'demo',
      async init(classCode) {
        cls = classCode; key = 'wbdemo:' + cls;
        ch = new BroadcastChannel('wbdemo-' + cls);
        ch.onmessage = notify;
        window.addEventListener('storage', e => { if (e.key === key) notify(); });
      },
      async updateStudent(sid, patch, inc) {
        const s = read(); const cur = s.students[sid] || { awayCount: 0, awayTotalMs: 0 };
        Object.assign(cur, patch);
        if (inc) for (const k in inc) cur[k] = (cur[k] || 0) + inc[k];
        s.students[sid] = cur; write(s);
      },
      async logEvent(ev) {
        const s = read(); s.events.push(ev); if (s.events.length > 300) s.events = s.events.slice(-300); write(s);
      },
      watchStudents(cb) { subs.push(s => cb(Object.entries(s.students).map(([id, v]) => ({ id, ...v })))); notify(); },
      watchEvents(cb) { subs.push(s => cb(s.events.slice(-100).reverse())); notify(); },
      async reset() { write({ students: {}, events: [] }); }, // 필기는 지우지 않음
      async loadInk(sid) {
        try { return JSON.parse(localStorage.getItem(`wbink:${cls}:${sid}`)) || {}; } catch (e) { return {}; }
      },
      async saveInk(sid, k, strokes) {
        const kk = `wbink:${cls}:${sid}`;
        let m = {}; try { m = JSON.parse(localStorage.getItem(kk)) || {}; } catch (e) {}
        m[k] = strokes; localStorage.setItem(kk, JSON.stringify(m));   // 용량 초과 시 예외 → 호출한 쪽에서 표시
      }
    };
  }

  // ---------------- Firebase 모드 ----------------
  function FirebaseBackend(config) {
    let db, F, cls;
    const sref = (sid) => F.doc(db, 'classes', cls, 'students', sid);
    return {
      mode: 'firebase',
      async init(classCode) {
        cls = classCode;
        const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
        const appM = await import(base + 'firebase-app.js');
        const fsM = await import(base + 'firebase-firestore.js');
        const auM = await import(base + 'firebase-auth.js');
        F = fsM;
        const app = appM.initializeApp(config);
        await auM.signInAnonymously(auM.getAuth(app));   // 보안 규칙: 로그인한(익명) 사용자만 읽기/쓰기
        db = fsM.getFirestore(app);
      },
      async updateStudent(sid, patch, inc) {
        const data = { ...patch };
        if (inc) for (const k in inc) data[k] = F.increment(inc[k]);
        await F.setDoc(sref(sid), data, { merge: true });
      },
      async logEvent(ev) { await F.addDoc(F.collection(db, 'classes', cls, 'events'), ev); },
      watchStudents(cb) {
        F.onSnapshot(F.collection(db, 'classes', cls, 'students'),
          snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
      },
      watchEvents(cb) {
        const q = F.query(F.collection(db, 'classes', cls, 'events'), F.orderBy('at', 'desc'), F.limit(100));
        F.onSnapshot(q, snap => cb(snap.docs.map(d => d.data())));
      },
      async loadInk(sid) {
        const snap = await F.getDocs(F.query(F.collection(db, 'classes', cls, 'ink'), F.where('sid', '==', sid)));
        const m = {};
        snap.forEach(d => { try { m[d.data().key] = JSON.parse(d.data().s); } catch (e) {} });
        return m;
      },
      async saveInk(sid, k, strokes) {
        await F.setDoc(F.doc(db, 'classes', cls, 'ink', `${sid}__${k}`), { sid, key: k, s: JSON.stringify(strokes), at: Date.now() });
      },
      async reset() {   // 접속·이탈 기록만 초기화 (학생 필기는 남김)
        for (const name of ['students', 'events']) {
          const snap = await F.getDocs(F.collection(db, 'classes', cls, name));
          let batch = F.writeBatch(db), n = 0;
          for (const d of snap.docs) { batch.delete(d.ref); if (++n % 400 === 0) { await batch.commit(); batch = F.writeBatch(db); } }
          await batch.commit();
        }
      }
    };
  }

  window.Backend = window.FIREBASE_CONFIG ? FirebaseBackend(window.FIREBASE_CONFIG) : DemoBackend();
})();
