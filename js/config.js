// ===================================================================
// 설정 파일 — 이 파일만 고치면 됩니다.
// ===================================================================

// 1) Firebase 설정
//    null 이면 "데모 모드"로 동작합니다. (현재: 실제 Firebase 연결됨)
//    데모 모드: 같은 PC·같은 브라우저 안에서만 학생 창 ↔ 교사 창이 연결됩니다.
//    (수업 전에 동작을 확인해 보는 용도)
//
//    실제 수업에서는 Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹)에서 복사한
//    firebaseConfig 객체를 아래 null 자리에 붙여 넣으세요. (README.md 참고)
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCrSYxxQisYq3985z_eDbnu7HdUtzBNlRY",
  authDomain: "math-workbook-b435f.firebaseapp.com",
  projectId: "math-workbook-b435f",
  storageBucket: "math-workbook-b435f.firebasestorage.app",
  messagingSenderId: "84496789545",
  appId: "1:84496789545:web:0337987ffd9ac7591eac38"
};
// ↑ Firebase 프로젝트 math-workbook-b435f (서울). 웹 앱의 apiKey는 공개돼도 되는 값이며, 접근은 보안 규칙(firestore.rules)으로 막습니다.
// 데모 모드로 돌아가려면 위 객체 대신 null 을 넣으세요.
/* 예시
window.FIREBASE_CONFIG = {
  apiKey: "AIza....",
  authDomain: "my-class.firebaseapp.com",
  projectId: "my-class",
  storageBucket: "my-class.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
*/

// 2) 기본 수업 코드 (반마다 다르게 쓰면 기록이 섞이지 않습니다. 예: "1-3")
window.DEFAULT_CLASS_CODE = "1-1";

// 3) 이탈 판정 설정
window.MONITOR = {
  blurGraceMs: 3000,      // 화면 분할·알림창 등으로 포커스만 잃은 상태가 이 시간 넘게 지속되면 '주의'
  heartbeatMs: 10000,     // 학생 페이지가 살아있음을 알리는 주기
  offlineAfterMs: 35000   // 이 시간 동안 소식이 없으면 교사 화면에 '연결 끊김'
};
