/* NOVUS ORDO — screen fragments (flex-first, responsive) */
const SCREENS = {};

/* ===================== DASHBOARD ===================== */
SCREENS.dashboard = `
  <div class="page-head">
    <div class="titleblock">
      <div class="breadcrumbs">ERP / HOME · CLEARANCE 3</div>
      <h1>대시보드</h1>
    </div>
    <div class="right">
      <span class="tag">LAST SYNC · 04:21 KST</span>
      <button class="btn">↻ 새로고침</button>
    </div>
  </div>

  <div class="cols cols-3" style="margin-bottom:var(--gap);">
    <div class="box">
      <div class="panel-title"><span>MY CHARACTER</span><span class="mono dim">OP-0208</span></div>
      <div class="row" style="align-items:flex-start; gap:14px;">
        <div class="seal">K</div>
        <div style="flex:1; min-width:0;">
          <div class="mono gold" style="font-size:10px; letter-spacing:0.15em;">OP-0208</div>
          <div class="strong" style="font-size:15px;">카렌 모리츠</div>
          <div class="mono dim" style="font-size:10px;">야전 · 서울-03</div>
          <div class="stack-s" style="margin-top:10px;">
            <div class="spread"><span class="mono muted" style="font-size:10px;">HP</span><div class="bar" style="flex:1;"><span style="width:85%;"></span></div><span class="mono" style="font-size:10px;">85</span></div>
            <div class="spread"><span class="mono muted" style="font-size:10px;">SAN</span><div class="bar" style="flex:1;"><span style="width:62%;"></span></div><span class="mono" style="font-size:10px;">62</span></div>
          </div>
        </div>
      </div>
      <button class="btn" data-go="character-detail" style="justify-content:center; margin-top:12px; width:100%;">시트 열기 →</button>
    </div>

    <div class="box">
      <div class="panel-title"><span>CREDITS</span><span class="mono dim">WALLET</span></div>
      <div class="big-num">¤ 14,820</div>
      <div class="mono dim" style="margin-top:6px; font-size:10px;">월 순이체 <span class="gold">＋2,500</span></div>
      <div class="row" style="gap:6px; margin-top:12px;">
        <button class="btn btn-sm" data-go="credits">지갑 →</button>
        <button class="btn btn-sm" data-go="credits">상점</button>
        <button class="btn btn-sm" data-go="credits">주식</button>
      </div>
    </div>

    <div class="box">
      <div class="panel-title"><span>RECENT NOTIFICATIONS</span><a class="mono" style="font-size:10px; color:var(--ink-2);" data-go="notifications">전체 →</a></div>
      <div class="stack-s" style="font-size:12px;">
        <div class="spread"><span><span class="tag tag-gold">SESSION</span> OP-047 브리핑 임박</span><span class="mono dim" style="font-size:10px;">09:12</span></div>
        <div class="spread"><span><span class="tag tag-info">DISCORD</span> @GM-이현 멘션</span><span class="mono dim" style="font-size:10px;">19:02</span></div>
        <div class="spread"><span><span class="tag tag-success">CREDITS</span> 보상 ¤3,200</span><span class="mono dim" style="font-size:10px;">어제</span></div>
      </div>
    </div>
  </div>

  <div class="cols cols-wide-narrow" style="margin-bottom:var(--gap);">
    <div class="box wide">
      <div class="panel-title"><span>UPCOMING SESSIONS · 이번 주</span><a class="mono" style="font-size:10px; color:var(--ink-2);" data-go="sessions">달력 →</a></div>
      <div class="stack">
        <div class="session-card">
          <div class="sc-code"><div class="code">OP-047</div><div class="sub mono">04/22 · 21:00</div></div>
          <div class="sc-body"><div class="strong">작전명: 은빛 경로</div><div class="sub">서울-03 · 3 OP · GM 이현</div></div>
          <div class="sc-meta"><span class="tag tag-gold">BRIEFING</span><button class="btn btn-sm" data-go="session-detail">상세</button></div>
        </div>
        <div class="session-card">
          <div class="sc-code"><div class="code">OP-048</div><div class="sub mono">04/26 · 22:00</div></div>
          <div class="sc-body"><div class="strong">작전명: 유리 교회</div><div class="sub">홍콩-01 · 4 OP · GM KR-BALD</div></div>
          <div class="sc-meta"><span class="tag">PLANNING</span><button class="btn btn-sm">상세</button></div>
        </div>
      </div>
    </div>

    <div class="box box-gold narrow">
      <div class="panel-title"><span class="gold">DISCORD BRIDGE</span><span class="mono dim">SYNC</span></div>
      <dl class="kv">
        <div class="kv-row"><dt>Guild</dt><dd>NOVUS ORDO · 본부</dd></div>
        <div class="kv-row"><dt>Bot</dt><dd class="mono">ORDO-BOT v1.4.2</dd></div>
        <div class="kv-row"><dt>Channels</dt><dd>24 linked</dd></div>
        <div class="kv-row"><dt>Last sync</dt><dd class="mono">04:19:52</dd></div>
      </dl>
      <div class="eyebrow" style="margin-top:14px; margin-bottom:6px;">LINKED CHANNELS</div>
      <div class="stack-s" style="font-size:11px;">
        <div class="spread"><span class="mono">#작전-브리핑</span><span class="tag tag-success">LIVE</span></div>
        <div class="spread"><span class="mono">#캐릭터-시트</span><span class="tag tag-success">LIVE</span></div>
        <div class="spread"><span class="mono">#후방-지원</span><span class="tag">IDLE</span></div>
        <div class="spread"><span class="mono">#문서고</span><span class="tag tag-info">READ</span></div>
      </div>
      <button class="btn" style="width:100%; justify-content:center; margin-top:12px;">Discord로 열기 ↗</button>
    </div>
  </div>

  <div class="cols cols-2">
    <div class="box">
      <div class="panel-title"><span>RECENT WIKI CHANGES</span><span class="tag tag-p1">P1</span></div>
      <div class="stack-s" style="font-size:12px;">
        <div class="spread"><span>Δ-11 외부 계약자 운용 <span class="mono dim">v3.2</span></span><span class="mono dim" style="font-size:10px;">04/12</span></div>
        <div class="spread"><span>재단 기밀 프로토콜 Δ-7</span><span class="mono dim" style="font-size:10px;">04/08</span></div>
        <div class="spread"><span>NPC-0412 파일 (신규)</span><span class="mono dim" style="font-size:10px;">04/04</span></div>
      </div>
    </div>
    <div class="box">
      <div class="panel-title"><span>MONTHLY STATS</span><span class="tag tag-p2">P2</span></div>
      <div class="cols cols-3" style="gap:12px;">
        <div><div class="eyebrow">세션 참여</div><div class="big-num" style="font-size:28px;">6</div></div>
        <div><div class="eyebrow">획득 ¤</div><div class="big-num" style="font-size:28px;">¤8.4k</div></div>
        <div><div class="eyebrow">MVP</div><div class="big-num" style="font-size:28px;">2</div></div>
      </div>
    </div>
  </div>
`;

/* ===================== SESSIONS ===================== */
SCREENS.sessions = `
  <div class="page-head">
    <div class="titleblock"><div class="breadcrumbs">ERP / SESSIONS</div><h1>세션</h1></div>
    <div class="right">
      <button class="btn">⇣ CSV</button>
      <button class="btn">리포트 템플릿</button>
      <button class="btn btn-primary">＋ 새 세션</button>
    </div>
  </div>

  <div class="tabs">
    <div class="tab active">달력</div><div class="tab">리스트</div><div class="tab">시리즈 / 챕터</div><div class="tab">리포트</div>
  </div>

  <div class="cols cols-wide-narrow">
    <div class="box wide">
      <div class="panel-title"><span>2026 · 04월</span>
        <div class="row" style="gap:4px;"><button class="btn btn-sm">‹ 3월</button><button class="btn btn-sm">오늘</button><button class="btn btn-sm">5월 ›</button></div>
      </div>
      <div class="cal-head"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>
      <div class="calendar">
        ${[
          [[29,'o'],[30,'o'],[31,'o'],[1,''],[2,''],[3,''],[4,'',{c:'OP-044',t:'alt2'}]],
          [[5,''],[6,''],[7,''],[8,'',{c:'OP-045',t:''}],[9,''],[10,''],[11,'']],
          [[12,''],[13,''],[14,''],[15,'',{c:'OP-046',t:'alt'}],[16,''],[17,''],[18,'']],
          [[19,'t'],[20,''],[21,''],[22,'',{c:'OP-047',t:''}],[23,''],[24,''],[25,'']],
          [[26,'',{c:'OP-048',t:''}],[27,''],[28,''],[29,''],[30,''],[1,'o'],[2,'o',{c:'OP-049',t:'alt2'}]],
        ].map(row => `<div class="cal-row">${row.map(([d,st,ev])=>`
          <div class="cal-cell ${st==='t'?'today':''} ${st==='o'?'other':''}">
            <div class="cday">${d}</div>
            ${ev?`<div class="cal-chip ${ev.t}">${ev.c}</div>`:''}
          </div>`).join('')}</div>`).join('')}
      </div>
      <div class="row" style="gap:12px; margin-top:10px; font-size:10px;">
        <span class="mono dim">GM 색상:</span>
        <span class="cal-chip">이현</span>
        <span class="cal-chip alt">KR-BALD</span>
        <span class="cal-chip alt2">아리사</span>
      </div>
    </div>

    <div class="box narrow">
      <div class="panel-title"><span>FILTERS</span></div>
      <div class="stack-s">
        <input class="input" placeholder="세션 코드 · 작전명 검색" />
        <select class="select"><option>ALL GM</option></select>
        <select class="select"><option>ALL 지부</option></select>
        <select class="select"><option>상태: 전체</option></select>
      </div>
      <div class="eyebrow" style="margin:16px 0 6px;">내 RSVP · 3</div>
      <div class="stack-s" style="font-size:12px;">
        <div class="spread"><span class="mono gold">OP-047</span><span class="tag tag-success">GOING</span></div>
        <div class="spread"><span class="mono gold">OP-048</span><span class="tag">MAYBE</span></div>
        <div class="spread"><span class="mono gold">OP-049</span><span class="tag tag-info">QUEUE</span></div>
      </div>
      <div class="eyebrow" style="margin:16px 0 6px;">DISCORD BOT</div>
      <div class="mono dim" style="font-size:10px;">registrar_bot · 세션 생성 알림 연동</div>
      <button class="btn btn-sm" style="margin-top:6px; width:100%; justify-content:center;">/session 명령</button>
    </div>
  </div>
`;

/* ===================== SESSION DETAIL ===================== */
SCREENS['session-detail'] = `
  <div class="page-head">
    <div class="titleblock"><div class="breadcrumbs">SESSIONS / OP-047</div><h1>은빛 경로 <span class="mono gold" style="font-size:14px; margin-left:10px;">OP-047</span></h1></div>
    <div class="right"><button class="btn">편집</button><button class="btn btn-primary">▶ 브리핑 열기</button></div>
  </div>

  <div class="tabs">
    <div class="tab active">개요</div><div class="tab">참가자</div><div class="tab">브리핑 문서</div><div class="tab">리포트 작성</div><div class="tab">Discord 로그</div>
  </div>

  <div class="cols cols-wide-narrow">
    <div class="wide stack">
      <div class="box">
        <div class="panel-title"><span>SYNOPSIS</span><span class="tag tag-gold">CLEARANCE 3</span></div>
        <p style="color:var(--ink-1); line-height:1.7;">[synopsis] 서울 지하 30m에서 수집된 비정상 무선 신호의 발신지 추적. 대상 구역은 구 교외 공장 부지이며 NOVUS ORDO 관할 Δ-구역과 중첩됨. 요원들은 외부 계약자로 가장해 진입하고 — 신호 송출 장치 확보가 일차 목표.</p>
        <div class="cols cols-3 mt-m" style="font-size:11px;">
          <div><div class="eyebrow">일시</div><div class="strong mono mt-s">04.22 · 21:00 KST</div></div>
          <div><div class="eyebrow">추정 소요</div><div class="strong mono mt-s">4–5h</div></div>
          <div><div class="eyebrow">시스템</div><div class="strong mono mt-s">DELTA GREEN d100</div></div>
          <div><div class="eyebrow">플랫폼</div><div class="strong mt-s">Discord + 대면</div></div>
          <div><div class="eyebrow">시리즈</div><div class="mt-s"><span class="tag">Δ-구역 챕터 3/6</span></div></div>
          <div><div class="eyebrow">상태</div><div class="mt-s"><span class="tag tag-gold">BRIEFING</span></div></div>
        </div>
      </div>

      <div class="box">
        <div class="panel-title"><span>OBJECTIVES</span></div>
        <ol style="margin:0; padding-left:18px; color:var(--ink-1); line-height:1.9;">
          <li>신호 송출 장치의 물리적 확보 — 파손 불가.</li>
          <li>접촉한 민간인 인지 흔적 제거.</li>
          <li>지역 내 잔류 Δ-개체 격리 요청 송신.</li>
        </ol>
      </div>

      <div class="box">
        <div class="panel-title"><span>REPORT TEMPLATE</span><span class="mono dim">GM 작성</span></div>
        <div class="stack-s" style="font-size:11px;">
          <div class="spread"><span>요약 (Summary)</span><span class="mono dim">— 미작성</span></div>
          <div class="spread"><span>참여자 / 역할</span><span class="mono dim">— 자동</span></div>
          <div class="spread"><span>MVP</span><span class="mono dim">— 선정 대기</span></div>
          <div class="spread"><span>획득 아이템 / 크레딧</span><span class="mono dim">— 자동</span></div>
          <div class="spread"><span>캐릭터 변동 (HP/SAN)</span><span class="mono dim">— 미작성</span></div>
        </div>
        <button class="btn" style="width:100%; justify-content:center; margin-top:12px;">리포트 작성 시작 →</button>
      </div>
    </div>

    <div class="narrow stack">
      <div class="box box-gold">
        <div class="panel-title"><span class="gold">PARTICIPANTS</span><span class="mono dim">3 / 4</span></div>
        <div class="stack-s">
          <div class="row"><div class="seal seal-sm">K</div><div style="flex:1; min-width:0;"><div class="strong">카렌 모리츠</div><div class="mono dim" style="font-size:10px;">@OP-0208 · 야전</div></div><span class="tag tag-success">READY</span></div>
          <div class="row"><div class="seal seal-sm">J</div><div style="flex:1; min-width:0;"><div class="strong">진 우</div><div class="mono dim" style="font-size:10px;">@OP-0311 · 기술</div></div><span class="tag tag-success">READY</span></div>
          <div class="row"><div class="seal seal-sm">R</div><div style="flex:1; min-width:0;"><div class="strong">라일라 샤</div><div class="mono dim" style="font-size:10px;">@OP-0174 · 의료</div></div><span class="tag">PENDING</span></div>
          <div class="row" style="opacity:.5;"><div class="seal seal-sm">?</div><div style="flex:1; min-width:0;"><div class="strong">— 공석 —</div><div class="mono dim" style="font-size:10px;">대기열 2명</div></div><button class="btn btn-sm">배정</button></div>
        </div>
      </div>

      <div class="box">
        <div class="panel-title"><span>GM</span></div>
        <div class="row"><div class="seal seal-sm">◉</div><div><div class="strong">이현</div><div class="mono dim" style="font-size:10px;">@GM-LEE · HOSTED · 23</div></div></div>
      </div>

      <div class="box">
        <div class="panel-title"><span>DISCORD LINK</span></div>
        <div class="mono" style="font-size:11px;">#작전-브리핑 · <span class="gold">op-047-silver-path</span></div>
        <button class="btn" style="width:100%; justify-content:center; margin-top:10px;">스레드 열기 ↗</button>
      </div>
    </div>
  </div>
`;

/* ===================== MISSIONS ===================== */
SCREENS.missions = `
  <div class="page-head">
    <div class="titleblock"><div class="breadcrumbs">ERP / MISSION BOARD</div><h1>미션 보드 <span class="tag tag-p1" style="margin-left:10px;">P1</span></h1></div>
    <div class="right"><button class="btn">내 신청 · 2</button><button class="btn btn-primary">＋ 미션 게시 (GM+)</button></div>
  </div>

  <div class="row" style="margin-bottom:var(--gap); gap:8px;">
    <input class="input" placeholder="미션명 · 태그 검색" style="flex:1;" />
    <select class="select" style="width:auto;"><option>난이도: ALL</option></select>
    <select class="select" style="width:auto;"><option>보상: ALL</option></select>
    <select class="select" style="width:auto;"><option>상태: OPEN</option></select>
  </div>

  <div class="cols cols-3">
    ${[
      {c:'MSN-014',n:'Δ-구역 후속 청소',gm:'이현',diff:'★★★',rew:'¤3,000 + EQ',slots:'2/3',st:'OPEN',tag:'gold'},
      {c:'MSN-015',n:'지하철 인지 교란 사건',gm:'아리사',diff:'★★★★',rew:'¤5,500',slots:'1/4',st:'OPEN',tag:'gold'},
      {c:'MSN-016',n:'외부 계약자 인수',gm:'KR-BALD',diff:'★★',rew:'¤1,800',slots:'3/3',st:'FULL',tag:''},
      {c:'MSN-012',n:'북해 신호 삼각측량',gm:'이현',diff:'★★★★★',rew:'¤9,000 + 훈장',slots:'0/5',st:'OPEN',tag:'gold'},
      {c:'MSN-011',n:'감시원 교대',gm:'관리자',diff:'★',rew:'¤800',slots:'1/2',st:'OPEN',tag:''},
      {c:'MSN-010',n:'기밀문서 인계',gm:'███',diff:'—',rew:'기밀',slots:'0/2',st:'CLSRD',tag:'danger'},
    ].map(m=>`
      <div class="box">
        <div class="spread"><span class="mono gold" style="font-size:10px; letter-spacing:0.12em;">${m.c}</span><span class="tag ${m.tag==='gold'?'tag-gold':m.tag==='danger'?'tag-danger':''}">${m.st}</span></div>
        <div class="strong mt-s" style="font-size:14px;">${m.n}</div>
        <div class="mono dim mt-s" style="font-size:10px;">GM ${m.gm}</div>
        <div class="cols cols-3 mt-m" style="gap:6px; font-size:10px;">
          <div><div class="eyebrow">난이도</div><div class="mono gold mt-s">${m.diff}</div></div>
          <div><div class="eyebrow">보상</div><div class="mono strong mt-s" style="font-size:10px;">${m.rew}</div></div>
          <div><div class="eyebrow">자리</div><div class="mono mt-s">${m.slots}</div></div>
        </div>
        <button class="btn ${m.st==='OPEN'?'btn-primary':''}" style="width:100%; justify-content:center; margin-top:12px;" ${m.st!=='OPEN'?'disabled':''}>${m.st==='OPEN'?'신청':m.st==='FULL'?'대기열':'마감됨'}</button>
      </div>
    `).join('')}
  </div>
`;

/* ===================== CHARACTERS ===================== */
SCREENS.characters = `
  <div class="page-head">
    <div class="titleblock"><div class="breadcrumbs">ERP / MY CHARACTERS</div><h1>캐릭터</h1></div>
    <div class="right"><button class="btn">⇣ 내보내기</button><button class="btn btn-primary">＋ 새 캐릭터</button></div>
  </div>

  <div class="row" style="margin-bottom:var(--gap); gap:8px;">
    <input class="input" placeholder="이름 · 코드네임 · 소속" style="flex:1;" />
    <select class="select" style="width:auto;"><option>ALL 타입</option></select>
    <select class="select" style="width:auto;"><option>ALL 상태</option></select>
    <div class="row" style="gap:2px;"><button class="btn btn-sm btn-primary">⊞ 카드</button><button class="btn btn-sm">≡ 테이블</button></div>
  </div>

  <div class="cols cols-3">
    ${[
      {code:'OP-0208', name:'카렌 모리츠', role:'야전 · 서울-03', san:62, hp:85, tag:'ACTIVE',mine:true},
      {code:'OP-0311', name:'진 우', role:'기술 · 서울-03', san:74, hp:92, tag:'ACTIVE'},
      {code:'OP-0174', name:'라일라 샤', role:'의료 · 홍콩-01', san:45, hp:68, tag:'ACTIVE', low:true},
      {code:'OP-0133', name:'사이토 켄', role:'분석 · 도쿄-02', san:81, hp:70, tag:'ON LEAVE'},
      {code:'OP-0088', name:'엘리 블랙웰', role:'잠입 · 런던-01', san:58, hp:54, tag:'ACTIVE'},
      {code:'OP-0411', name:'진예린', role:'야전 · 서울-03', san:90, hp:100, tag:'PROBATION'},
      {code:'RIP-0042', name:'안톤 코왈', role:'— 사망 · OP-039', san:0, hp:0, tag:'KIA', dead:true},
    ].map(c => `
      <div class="box" style="cursor:pointer; ${c.dead?'opacity:.55;':''}" data-go="character-detail">
        <div class="row">
          <div class="seal">${c.name[0]}</div>
          <div style="flex:1; min-width:0;">
            <div class="mono gold" style="font-size:11px;">${c.code}${c.mine?' · MINE':''}</div>
            <div class="strong" style="font-size:15px;">${c.name}</div>
            <div class="mono dim" style="font-size:10px;">${c.role}</div>
          </div>
          <span class="tag ${c.tag==='ACTIVE'?'tag-success':c.tag==='PROBATION'?'tag-info':c.tag==='KIA'?'tag-danger':''}">${c.tag}</span>
        </div>
        <div class="stack-s mt-m">
          <div class="spread"><span class="mono muted" style="font-size:10px;">HP</span><div class="bar" style="flex:1;"><span style="width:${c.hp}%;"></span></div><span class="mono" style="font-size:10px;">${c.hp}</span></div>
          <div class="spread"><span class="mono muted" style="font-size:10px;">SAN</span><div class="bar ${c.low?'bar-danger':''}" style="flex:1;"><span style="width:${c.san}%;"></span></div><span class="mono" style="font-size:10px; ${c.low?'color:var(--danger);':''}">${c.san}</span></div>
        </div>
      </div>
    `).join('')}
  </div>
`;

/* ===================== CHARACTER DETAIL ===================== */
SCREENS['character-detail'] = `
  <div class="page-head">
    <div class="titleblock"><div class="breadcrumbs">CHARACTERS / OP-0208</div><h1>카렌 모리츠</h1></div>
    <div class="right"><button class="btn">편집</button><button class="btn">PDF ⇣</button><button class="btn btn-primary">⌕ Discord 시트 ↗</button></div>
  </div>

  <div class="cols cols-side-main">
    <div class="side stack">
      <div class="box">
        <div class="ph" style="aspect-ratio:3/4;">CHARACTER PORTRAIT<br/>— PLACEHOLDER —</div>
        <div style="margin-top:12px; text-align:center;">
          <div class="mono gold" style="letter-spacing:0.15em;">OP-0208</div>
          <h2 style="margin-top:4px;">카렌 모리츠</h2>
          <div class="mono dim" style="font-size:10px; letter-spacing:0.15em; margin-top:4px;">KAREN MORITZ · 야전 · 서울-03</div>
        </div>
        <div class="row" style="margin-top:12px; justify-content:center; gap:6px;">
          <span class="tag tag-success">ACTIVE</span>
          <span class="tag tag-gold">CLEARANCE 3</span>
        </div>
      </div>

      <div class="box">
        <div class="panel-title"><span>VITALS</span></div>
        <div class="stack-s">
          <div><div class="spread"><span class="mono muted">HP</span><span class="mono strong">85 / 100</span></div><div class="bar mt-s"><span style="width:85%;"></span></div></div>
          <div><div class="spread"><span class="mono muted">SAN</span><span class="mono strong">62 / 99</span></div><div class="bar mt-s"><span style="width:62%;"></span></div></div>
          <div><div class="spread"><span class="mono muted">LUCK</span><span class="mono strong">48 / 99</span></div><div class="bar bar-info mt-s"><span style="width:48%;"></span></div></div>
          <div><div class="spread"><span class="mono muted">BP</span><span class="mono strong">3 / 5</span></div><div class="pips">${'<span class="on"></span>'.repeat(3)}${'<span></span>'.repeat(2)}</div></div>
        </div>
      </div>
    </div>

    <div class="main-col stack">
      <div class="tabs">
        <div class="tab active">스탯</div><div class="tab">스킬</div><div class="tab">장비</div><div class="tab">크레딧</div><div class="tab">세션 이력</div><div class="tab">타임라인</div>
      </div>

      <div class="box">
        <div class="panel-title"><span>ATTRIBUTES</span><span class="mono dim">d100</span></div>
        <div class="cols cols-3" style="gap:8px;">
          ${[['STR',62],['CON',58],['SIZ',55],['DEX',74],['APP',68],['INT',82],['POW',66],['EDU',78],['CHA',60]].map(([k,v])=>`
            <div class="box box-solid" style="padding:12px; text-align:center; min-width:110px;">
              <div class="eyebrow">${k}</div>
              <div class="mono gold" style="font-size:26px; margin-top:4px;">${v}</div>
              <div class="mono dim" style="font-size:9px; margin-top:2px;">½ ${Math.floor(v/2)} · ⅕ ${Math.floor(v/5)}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="box">
        <div class="panel-title"><span>CHARACTER TIMELINE</span><span class="tag tag-p1">P1 · 자동 누적</span></div>
        <div class="timeline">
          <div class="tl-item"><div class="tl-time">2024.02 · ENLIST</div><div class="tl-body">서울-03 야전 수습 배정.</div></div>
          <div class="tl-item"><div class="tl-time">2025.06 · OP-014</div><div class="tl-body">첫 작전 "푸른 편지" — 경미한 부상.</div></div>
          <div class="tl-item"><div class="tl-time">2026.01 · PROMO</div><div class="tl-body">CLEARANCE 2 → 3 승급.</div></div>
          <div class="tl-item"><div class="tl-time">OP-046 · CLOSED</div><div class="tl-body">"푸른 서재" — SAN −4, 획득 ¤1,200</div></div>
          <div class="tl-item"><div class="tl-time">OP-047 · UPCOMING</div><div class="tl-body">"은빛 경로" 브리핑 대기.</div></div>
        </div>
      </div>
    </div>
  </div>
`;

/* ===================== IDENTITY v2 — org chart drilldown ===================== */
SCREENS.identity = `
  <div class="page-head">
    <div class="titleblock">
      <div class="breadcrumbs">ERP / PERSONNEL</div>
      <h1>신원 조회 <span class="tag" style="margin-left:10px; font-size:10px;">READ-ONLY</span></h1>
    </div>
    <div class="right">
      <span class="clr-pill">
        CLR · H <span class="clr-dots"><span class="on"></span><span class="on"></span><span class="on"></span><span></span><span></span><span></span></span>
      </span>
      <button class="btn btn-sm">등급 안내</button>
    </div>
  </div>

  <!-- Clearance context strip -->
  <div class="notice gold" style="margin-bottom:14px;">
    <span class="label">CLEARANCE</span>
    <span>내 열람 등급 <span class="mono gold">H (3)</span> — 이 등급 이상의 필드만 노출됩니다. 상위 등급 필드는 <span class="classified-tag">CLASSIFIED</span> 로 표시됩니다.</span>
    <span class="mono dim" style="margin-left:auto; font-size:9px;">산출: max(내 캐릭터 agentLevel, securityClearance)</span>
  </div>

  <!-- Search + filter bar -->
  <div class="box" style="margin-bottom:var(--gap);">
    <div class="row" style="gap:14px; flex-wrap:wrap;">
      <div class="row" style="gap:6px; flex:1; min-width:220px;">
        <input class="input" placeholder="codename · 역할 · 부서 · 실명(G+ 필요) 검색" value="" style="flex:1;"/>
        <button class="btn">⌕ 검색</button>
      </div>
      <div class="row" style="gap:12px;">
        <span class="mono dim" style="font-size:10px; letter-spacing:0.2em;">TYPE</span>
        <div class="seg">
          <button class="on">ALL · 233</button>
          <button>AGENT · 34</button>
          <button>NPC · 199</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Breadcrumb / drill state -->
  <div class="org-breadcrumbs" style="margin-bottom:14px;">
    <span class="crumb on">◎ 조직도 L1</span>
    <span class="sep">›</span>
    <span class="crumb">세력/기관 선택</span>
    <span class="sep">›</span>
    <span class="crumb">하위 기구</span>
    <span class="sep">›</span>
    <span class="crumb">개인 Dossier</span>
  </div>

  <!-- L1 조감뷰 -->
  <div class="org-canvas">
    <svg class="org-lines" viewBox="0 0 1000 560" preserveAspectRatio="none">
      <g fill="none" stroke="rgba(201,168,90,0.35)" stroke-width="1" stroke-dasharray="4 4">
        <path d="M290 120 L160 320"/>
        <path d="M290 120 L420 320"/>
        <path d="M540 170 L760 170"/>
        <path d="M540 170 L760 310"/>
        <path d="M760 170 L820 310"/>
      </g>
      <g fill="none" stroke="rgba(138,120,64,0.25)" stroke-width="1">
        <path d="M290 140 L290 560"/>
        <path d="M760 200 L760 560"/>
      </g>
    </svg>

    <div class="org-canvas-inner">
      <!-- FACTIONS -->
      <div>
        <div class="org-factions-title">3대 세력 · FACTIONS</div>
        <div class="org-factions">
          <div class="org-node lg faction" data-go="identity-detail">
            <div class="tl"></div><div class="br"></div>
            <div class="emblem">✦</div>
            <div class="code">COUNCIL</div>
            <div class="label">이사회</div>
            <div class="label-en">COUNCIL</div>
            <div class="headcount"><span class="n">14</span><span class="u">MEMBERS</span></div>
          </div>
          <div class="org-node lg faction">
            <div class="tl"></div><div class="br"></div>
            <div class="emblem">✶</div>
            <div class="code">MILITARY</div>
            <div class="label">군부</div>
            <div class="label-en">MILITARY</div>
            <div class="headcount"><span class="n">48</span><span class="u">MEMBERS</span></div>
          </div>
          <div class="org-node lg faction">
            <div class="tl"></div><div class="br"></div>
            <div class="emblem">◈</div>
            <div class="code">CIVIL</div>
            <div class="label">시민사회</div>
            <div class="label-en">CIVIL</div>
            <div class="headcount"><span class="n">32</span><span class="u">MEMBERS</span></div>
          </div>
        </div>
      </div>

      <!-- INSTITUTIONS -->
      <div>
        <div class="org-inst-title">독립 기관 · INSTITUTIONS</div>
        <div class="org-inst">
          <div class="org-node has-sub">
            <div class="tl"></div><div class="br"></div>
            <div class="code">SECRETARIAT</div>
            <div class="label">사무국</div>
            <div class="label-en">SECRETARIAT · 4개 하위 기구</div>
            <div class="headcount"><span class="n">62</span><span class="u">MEMBERS</span></div>
          </div>
          <div class="org-node">
            <div class="tl"></div><div class="br"></div>
            <div class="code">FINANCE</div>
            <div class="label">재무국</div>
            <div class="label-en">FINANCE</div>
            <div class="headcount"><span class="n">18</span><span class="u">MEMBERS</span></div>
          </div>
        </div>

        <div class="org-unassigned">
          <div class="org-unassigned-title">UNASSIGNED · 미배정 · 9명</div>
          <div class="row" style="gap:8px; flex-wrap:wrap;">
            <span class="tag mono" style="font-size:10px;">CIV-1204</span>
            <span class="tag mono" style="font-size:10px;">CIV-1188</span>
            <span class="tag mono" style="font-size:10px;">OP-T-0044</span>
            <span class="tag mono dim" style="font-size:10px;">+6</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- L2 드릴다운 상태 미리보기 : SECRETARIAT 확장 -->
  <div style="margin-top:24px;">
    <div class="group-hero">
      <div class="cor tl"></div><div class="cor tr"></div><div class="cor bl"></div><div class="cor br"></div>
      <div class="row" style="gap:16px; flex-wrap:wrap; align-items:flex-end;">
        <div>
          <div class="eyebrow">INSTITUTION · SECRETARIAT</div>
          <h2 style="margin:4px 0 0;">사무국</h2>
          <div class="mono dim" style="font-size:10px; letter-spacing:0.2em; margin-top:2px;">SECRETARIAT · 4 sub-units · 62 members</div>
        </div>
        <div class="row" style="gap:6px; margin-left:auto;">
          <button class="btn btn-sm">← 조직도</button>
          <button class="btn btn-sm">조직 개관 PDF</button>
        </div>
      </div>
    </div>

    <!-- Sub-units 아코디언 (SECRETARIAT 의 4개) -->
    <div style="margin-top:14px;">
      <div class="subunit open">
        <div class="subunit-head">
          <span class="arr">▸</span>
          <span class="code">RESEARCH</span>
          <span class="label">연구 기구</span>
          <span class="mono dim" style="font-size:9px;">/ 4 AGENT · 17 NPC</span>
          <span class="count">21명 · 부서장 1</span>
        </div>
        <div class="subunit-body">
          <div class="grid-cards">

            <!-- 1) LEAD -->
            <div class="pcard lead" data-go="identity-detail">
              <div class="phead">
                <div class="pavatar">IMG</div>
                <div class="pbody">
                  <div class="pcode">OP-0208</div>
                  <div class="pname">카렌 모리츠</div>
                  <div class="prole">선임 분석관 · 연구 기구</div>
                </div>
              </div>
              <div class="pmeta">
                <span class="tag">AGENT</span>
                <span class="clr-pill" style="padding:2px 7px; font-size:9px;">CLR · A <span class="clr-dots"><span class="on"></span><span class="on"></span><span class="on"></span><span class="on"></span><span class="on"></span><span></span></span></span>
              </div>
            </div>

            <!-- 2) normal AGENT -->
            <div class="pcard" data-go="identity-detail">
              <div class="phead">
                <div class="pavatar">IMG</div>
                <div class="pbody">
                  <div class="pcode">OP-0412</div>
                  <div class="pname">하세가와 아야</div>
                  <div class="prole">분석관 · Σ-04 담당</div>
                </div>
              </div>
              <div class="pmeta">
                <span class="tag">AGENT</span>
                <span class="clr-pill" style="padding:2px 7px; font-size:9px;">CLR · M <span class="clr-dots"><span class="on"></span><span class="on"></span><span class="on"></span><span class="on"></span><span></span><span></span></span></span>
                <span class="tag">DORMANT</span>
              </div>
              <div class="pfoot">
                <span>⚠ 상위 기밀 2건</span><span>M 등급 필요</span>
              </div>
            </div>

            <!-- 3) identity masked (내 CLR=H, 대상은 내가 identity 볼 수 있음 G, name 보임) -->
            <div class="pcard" data-go="identity-detail">
              <div class="phead">
                <div class="pavatar">IMG</div>
                <div class="pbody">
                  <div class="pcode">OP-0518</div>
                  <div class="pname">진 우</div>
                  <div class="prole">주니어 분석관</div>
                </div>
              </div>
              <div class="pmeta">
                <span class="tag">AGENT</span>
                <span class="clr-pill" style="padding:2px 7px; font-size:9px;">CLR · G <span class="clr-dots"><span class="on"></span><span class="on"></span><span></span><span></span><span></span><span></span></span></span>
              </div>
            </div>

            <!-- 4) NPC unknown name (identity 필드 CLR G 통과, name 보임) -->
            <div class="pcard" data-go="identity-detail">
              <div class="phead">
                <div class="pavatar">NPC</div>
                <div class="pbody">
                  <div class="pcode">NPC-0044</div>
                  <div class="pname">마리나 수아레즈</div>
                  <div class="prole">외부 연구원 · 지원 NPC</div>
                </div>
              </div>
              <div class="pmeta">
                <span class="tag">NPC</span>
                <span class="clr-pill" style="padding:2px 7px; font-size:9px;">CLR · H <span class="clr-dots"><span class="on"></span><span class="on"></span><span class="on"></span><span></span><span></span><span></span></span></span>
              </div>
            </div>

            <!-- 5) REDACTED — CLASSIFIED higher than me -->
            <div class="pcard">
              <div class="phead">
                <div class="pavatar sealed">☩</div>
                <div class="pbody">
                  <div class="pcode">CLS-0044</div>
                  <div class="pname redact">████████</div>
                  <div class="prole">기밀 자산 · §§§§§</div>
                </div>
              </div>
              <div class="pmeta">
                <span class="tag tag-danger">REDACTED</span>
                <span class="clr-pill" style="padding:2px 7px; font-size:9px; border-color:var(--danger); color:var(--danger);">CLR · V+</span>
              </div>
              <div class="pfoot">
                <span>⚠ 전체 마스킹</span><span>V 등급 필요</span>
              </div>
            </div>

            <!-- 6) deceased NPC -->
            <div class="pcard" style="opacity:0.72;" data-go="identity-detail">
              <div class="phead">
                <div class="pavatar">DCS</div>
                <div class="pbody">
                  <div class="pcode">DCS-0711</div>
                  <div class="pname">모리 아야</div>
                  <div class="prole">고(故) · 연구원 · 교토-01</div>
                </div>
              </div>
              <div class="pmeta">
                <span class="tag">NPC</span>
                <span class="tag tag-danger">DECEASED</span>
                <span class="clr-pill" style="padding:2px 7px; font-size:9px;">CLR · G <span class="clr-dots"><span class="on"></span><span class="on"></span><span></span><span></span><span></span><span></span></span></span>
              </div>
            </div>

          </div>
        </div>
      </div>

      <div class="subunit">
        <div class="subunit-head">
          <span class="arr">▸</span>
          <span class="code">ADMIN_BUREAU</span>
          <span class="label">행정 기구</span>
          <span class="mono dim" style="font-size:9px;">/ 2 AGENT · 13 NPC</span>
          <span class="count">15명</span>
        </div>
      </div>
      <div class="subunit">
        <div class="subunit-head">
          <span class="arr">▸</span>
          <span class="code">INTL</span>
          <span class="label">국제 기구</span>
          <span class="mono dim" style="font-size:9px;">/ 3 AGENT · 8 NPC</span>
          <span class="count">11명</span>
        </div>
      </div>
      <div class="subunit">
        <div class="subunit-head">
          <span class="arr">▸</span>
          <span class="code">CONTROL</span>
          <span class="label">통제 기구</span>
          <span class="mono dim" style="font-size:9px;">/ 2 AGENT · 13 NPC</span>
          <span class="count">15명 · <span style="color:var(--danger);">기밀 4건</span></span>
        </div>
      </div>
    </div>
  </div>

  <!-- Search result banner 예시 -->
  <div class="notice" style="margin-top:18px;">
    <span class="label">SEARCH</span>
    <span>"아야" 매칭 <span class="mono gold">7건</span> · 현재 그룹 <span class="mono">5건</span></span>
    <button class="btn btn-sm" style="margin-left:auto;">다른 그룹 2건 보기 →</button>
  </div>

  <!-- Legend -->
  <div class="box mt-m" style="padding:12px 14px;">
    <div class="row" style="gap:18px; flex-wrap:wrap; font-size:10px; color:var(--ink-3);">
      <div class="row" style="gap:6px;"><span class="lv-scale"><span class="on"></span><span class="on"></span><span class="on"></span><span class="on"></span><span class="on"></span><span class="on"></span></span><span class="mono">V · 최고기밀</span></div>
      <div class="row" style="gap:6px;"><span class="lv-scale"><span class="on"></span><span class="on"></span><span class="on"></span><span class="on"></span><span class="on"></span><span></span></span><span class="mono">A · 상급</span></div>
      <div class="row" style="gap:6px;"><span class="lv-scale"><span class="on"></span><span class="on"></span><span class="on"></span><span class="on"></span><span></span><span></span></span><span class="mono">M · 중상급</span></div>
      <div class="row" style="gap:6px;"><span class="lv-scale"><span class="on"></span><span class="on"></span><span class="on"></span><span></span><span></span><span></span></span><span class="mono">H · 중급</span></div>
      <div class="row" style="gap:6px;"><span class="lv-scale"><span class="on"></span><span class="on"></span><span></span><span></span><span></span><span></span></span><span class="mono">G · 일반</span></div>
      <div class="row" style="gap:6px;"><span class="lv-scale"><span class="on"></span><span></span><span></span><span></span><span></span><span></span></span><span class="mono">J · 주니어</span></div>
      <div class="row" style="gap:6px;"><span class="classified-tag">CLASSIFIED</span><span>값 마스킹</span></div>
      <div class="row" style="gap:6px;"><span class="redact-block" style="width:80px;"></span><span>REDACTED 블록</span></div>
    </div>
  </div>
`;

/* ===================== HALL OF FAME ===================== */
SCREENS['hall-of-fame'] = `
  <div class="page-head">
    <div class="titleblock"><div class="breadcrumbs">ERP / HALL OF FAME</div><h1>명예의 전당 <span class="tag tag-p1" style="margin-left:10px;">P1</span></h1></div>
    <div class="right"><button class="btn">헌액 기준</button></div>
  </div>

  <div class="tabs">
    <div class="tab active">전설 헌액</div><div class="tab">세션 MVP</div><div class="tab">훈장</div><div class="tab">랭킹 <span class="tag tag-p2" style="margin-left:6px;">P2</span></div>
  </div>

  <div class="cols cols-3">
    ${[
      {code:'RIP-0042',n:'안톤 코왈',sub:'— 사망 · OP-039',m:'혼자 남아 신호를 송신한 기술자.',seal:'☩'},
      {code:'RET-0019',n:'엘레나 V.',sub:'— 은퇴 · 2025',m:'28회 작전 생환. 후배 12명 양성.',seal:'✧'},
      {code:'RIP-0077',n:'마크 스즈키',sub:'— 사망 · OP-028',m:'Δ-개체 격리에 자신을 봉인.',seal:'☩'},
    ].map(c=>`
      <div class="hof-card">
        <div class="row"><div class="seal">${c.seal}</div>
          <div><div class="mono gold" style="font-size:10px;">${c.code}</div><div class="strong" style="font-size:15px;">${c.n}</div><div class="mono dim" style="font-size:10px;">${c.sub}</div></div>
        </div>
        <div class="ph" style="aspect-ratio:16/9; margin-top:10px;">HONOR PORTRAIT</div>
        <p style="color:var(--ink-1); font-size:12px; margin:8px 0 0;">${c.m}</p>
      </div>
    `).join('')}
  </div>

  <div class="cols cols-2 mt-m">
    <div class="box">
      <div class="panel-title"><span>RECENT SESSION MVPs</span></div>
      <table class="t">
        <thead><tr><th>세션</th><th>MVP</th><th>GM</th><th>사유</th></tr></thead>
        <tbody>
          <tr><td class="mono gold">OP-046</td><td class="strong">카렌 모리츠</td><td>이현</td><td>인질 4명 전원 생환 확보</td></tr>
          <tr><td class="mono gold">OP-045</td><td class="strong">진 우</td><td>아리사</td><td>신호 해독 30분 단축</td></tr>
          <tr><td class="mono gold">OP-044</td><td class="strong">엘리 블랙웰</td><td>KR-BALD</td><td>단독 잠입 성공</td></tr>
        </tbody>
      </table>
    </div>
    <div class="box">
      <div class="panel-title"><span>MEDAL HOLDERS · 훈장</span></div>
      <div class="stack-s" style="font-size:12px;">
        <div class="spread"><span>🜚 최고 은성 훈장 · 3명</span><button class="btn btn-sm">명단</button></div>
        <div class="spread"><span>🜛 봉인 유공 훈장 · 7명</span><button class="btn btn-sm">명단</button></div>
        <div class="spread"><span>✜ 구호 훈장 · 14명</span><button class="btn btn-sm">명단</button></div>
        <div class="spread"><span>❂ 신임 우수 · 22명</span><button class="btn btn-sm">명단</button></div>
      </div>
    </div>
  </div>
`;

/* ===================== EQUIPMENT (slot + inventory + catalog) ===================== */
SCREENS.equipment = `
  <div class="page-head">
    <div class="titleblock"><div class="breadcrumbs">ERP / EQUIPMENT</div><h1>장비</h1></div>
    <div class="right"><button class="btn">거래 로그</button><button class="btn btn-primary">＋ 장비 요청</button></div>
  </div>

  <div class="tabs">
    <div class="tab active">내 장비</div><div class="tab">도감</div><div class="tab">거래 이력</div><div class="tab">수리·개조</div><div class="tab">경매 <span class="tag tag-p2" style="margin-left:6px;">P2</span></div>
  </div>

  <div class="cols cols-wide-narrow">
    <div class="wide stack">
      <div class="box">
        <div class="panel-title"><span>EQUIPPED · 장착 슬롯</span><span class="mono dim">카렌 모리츠</span></div>
        <div class="slot-grid">
          <div class="slot filled"><div class="slot-label">주무기</div><div class="strong">소구경 권총</div><div class="mono dim" style="font-size:9px;">EQ-112 · COND 92</div></div>
          <div class="slot filled"><div class="slot-label">보조무기</div><div class="strong">전술 나이프</div><div class="mono dim" style="font-size:9px;">EQ-054 · COND 88</div></div>
          <div class="slot"><div class="slot-label">방어구</div><div class="dim">— 미장착 —</div></div>
          <div class="slot filled"><div class="slot-label">센서</div><div class="strong">야간 투시경 Mk.III</div><div class="mono dim" style="font-size:9px;">EQ-044 · 대여중</div></div>
          <div class="slot filled"><div class="slot-label">통신</div><div class="strong">암호화 무전기</div><div class="mono dim" style="font-size:9px;">EQ-208 · COND 74</div></div>
          <div class="slot filled"><div class="slot-label">의료</div><div class="strong">현장 키트</div><div class="mono dim" style="font-size:9px;">EQ-517 · COND 40</div></div>
          <div class="slot"><div class="slot-label">기타 1</div><div class="dim">— 빈 슬롯 —</div></div>
          <div class="slot"><div class="slot-label">기타 2</div><div class="dim">— 빈 슬롯 —</div></div>
        </div>
      </div>

      <div class="box">
        <div class="panel-title"><span>INVENTORY</span><span class="mono dim">8 items</span></div>
        <div class="cols cols-4">
          ${[
            {c:'EQ-044',n:'야간 투시경 Mk.III',cat:'센서',stat:'대여 중',cond:86},
            {c:'EQ-112',n:'소구경 권총',cat:'화기',stat:'장착',cond:92},
            {c:'EQ-208',n:'암호화 무전기',cat:'통신',stat:'장착',cond:74},
            {c:'EQ-311',n:'전술 부츠',cat:'의복',stat:'보유',cond:58},
            {c:'EQ-402',n:'Δ-차폐 케이스',cat:'기밀 운반',stat:'기밀',cond:100},
            {c:'EQ-517',n:'의료 키트',cat:'의료',stat:'장착',cond:40,low:true},
            {c:'EQ-601',n:'위장 신분증 ×3',cat:'문서',stat:'보유',cond:100},
            {c:'EQ-720',n:'오컬트 기호 사전',cat:'참고',stat:'보유',cond:95},
          ].map(e=>`
            <div class="eq-card">
              <div class="ph eq-thumb">${e.cat.toUpperCase()}</div>
              <div class="mono gold" style="font-size:10px;">${e.c}</div>
              <div class="strong" style="font-size:12px;">${e.n}</div>
              <div class="mono dim" style="font-size:9px;">${e.cat}</div>
              <div class="row" style="gap:6px;">
                <div class="bar ${e.low?'bar-danger':''}" style="flex:1;"><span style="width:${e.cond}%;"></span></div>
                <span class="mono" style="font-size:10px;">${e.cond}%</span>
              </div>
              <div class="spread"><span class="tag ${e.stat==='대여 중'?'tag-info':e.stat==='기밀'?'tag-gold':e.stat==='장착'?'tag-success':''}">${e.stat}</span><button class="btn btn-sm">관리</button></div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <div class="narrow stack">
      <div class="box">
        <div class="panel-title"><span>CATALOG · 도감</span></div>
        <div class="mono dim" style="font-size:10px; margin-bottom:10px;">미획득 장비는 실루엣 처리</div>
        <div class="cols cols-2">
          <div class="ph" style="aspect-ratio:1; filter:blur(1px); opacity:.5;">???</div>
          <div class="ph" style="aspect-ratio:1;">획득됨</div>
          <div class="ph" style="aspect-ratio:1; filter:blur(1px); opacity:.5;">???</div>
          <div class="ph" style="aspect-ratio:1;">획득됨</div>
          <div class="ph" style="aspect-ratio:1; filter:blur(1px); opacity:.5;">???</div>
          <div class="ph" style="aspect-ratio:1; filter:blur(1px); opacity:.5;">???</div>
        </div>
        <div class="mono dim mt-m" style="font-size:10px;">수집률 <span class="gold">42%</span> (38 / 90)</div>
      </div>
      <div class="box">
        <div class="panel-title"><span>OWNER CHAIN</span><span class="tag tag-p1">P1</span></div>
        <div class="mono" style="font-size:11px;">EQ-044 · 야간 투시경 Mk.III</div>
        <div class="timeline mt-s">
          <div class="tl-item"><div class="tl-time">2026.04</div><div class="tl-body">@OP-0208 (대여중)</div></div>
          <div class="tl-item"><div class="tl-time">2026.02</div><div class="tl-body">@OP-0311 → 반환</div></div>
          <div class="tl-item"><div class="tl-time">2025.11</div><div class="tl-body">중앙 창고 입고</div></div>
        </div>
      </div>
    </div>
  </div>
`;

/* ===================== CREDITS ===================== */
SCREENS.credits = `
  <div class="page-head">
    <div class="titleblock"><div class="breadcrumbs">ERP / CREDITS</div><h1>크레딧</h1></div>
    <div class="right"><button class="btn">⇣ CSV</button><button class="btn btn-primary">＋ 이체</button></div>
  </div>

  <div class="tabs">
    <div class="tab active">지갑</div><div class="tab">상점</div><div class="tab">이체·송금</div><div class="tab">주식 <span class="tag tag-p1" style="margin-left:6px;">P1</span></div><div class="tab">월급 스케줄 (GM+)</div><div class="tab">경제 지표 <span class="tag tag-p2" style="margin-left:6px;">P2</span></div>
  </div>

  <div class="cols cols-3" style="margin-bottom:var(--gap);">
    <div class="box">
      <div class="panel-title"><span>BALANCE</span><span class="mono dim">OP-0208</span></div>
      <div class="big-num">¤ 14,820</div>
      <div class="mono dim" style="margin-top:6px; font-size:10px;">NOVUS CREDITS · DISCORD 동기화</div>
      <div class="row mt-m" style="gap:6px;">
        <button class="btn btn-sm btn-primary">이체</button>
        <button class="btn btn-sm">요청</button>
        <button class="btn btn-sm">상점</button>
      </div>
    </div>
    <div class="box">
      <div class="panel-title"><span>30-DAY FLOW</span></div>
      <div class="spark">
        ${Array.from({length:30}).map((_,i)=>`<span style="height:${20+Math.abs(Math.sin(i*1.3))*70}%;"></span>`).join('')}
      </div>
      <div class="spread mt-s" style="font-size:11px;">
        <div><div class="mono dim">IN</div><div class="mono gold">＋6,400</div></div>
        <div><div class="mono dim">OUT</div><div class="mono" style="color:var(--danger);">−3,900</div></div>
        <div><div class="mono dim">NET</div><div class="mono strong">＋2,500</div></div>
      </div>
    </div>
    <div class="box">
      <div class="panel-title"><span>STOCK · 보유 주식</span></div>
      <div class="stack-s" style="font-size:12px;">
        <div class="spread"><span>ORX · 오릭스 중공업</span><span class="mono gold">＋4.2%</span></div>
        <div class="spread"><span>KNA · 카네이 제약</span><span class="mono" style="color:var(--danger);">−1.8%</span></div>
        <div class="spread"><span>MRK · 마르크 금융</span><span class="mono gold">＋0.6%</span></div>
      </div>
      <button class="btn btn-sm" style="width:100%; justify-content:center; margin-top:10px;">거래소 열기 →</button>
    </div>
  </div>

  <div class="cols cols-wide-narrow">
    <div class="box wide">
      <div class="panel-title"><span>TRANSACTIONS</span><span class="mono dim">최근 20건</span></div>
      <table class="t">
        <thead><tr><th>TIME</th><th>TYPE</th><th>상대</th><th>설명</th><th style="text-align:right;">¤</th><th>BAL</th></tr></thead>
        <tbody>
          <tr><td class="mono">04/19 02:17</td><td><span class="tag">TRANSFER</span></td><td class="mono">@OP-0412</td><td>장비 수리 분담</td><td class="mono" style="text-align:right; color:var(--danger);">−2,400</td><td class="mono">14,820</td></tr>
          <tr><td class="mono">04/15 01:08</td><td><span class="tag tag-success">REWARD</span></td><td>SYSTEM</td><td>OP-046 완료</td><td class="mono gold" style="text-align:right;">＋3,200</td><td class="mono">17,220</td></tr>
          <tr><td class="mono">04/14 23:44</td><td><span class="tag tag-info">SHOP</span></td><td>장비창고</td><td>야간 투시경 대여</td><td class="mono" style="text-align:right; color:var(--danger);">−800</td><td class="mono">14,020</td></tr>
          <tr><td class="mono">04/10 18:30</td><td><span class="tag">SALARY</span></td><td>SYSTEM</td><td>4월 월급</td><td class="mono gold" style="text-align:right;">＋1,500</td><td class="mono">14,820</td></tr>
          <tr><td class="mono">04/05 14:02</td><td><span class="tag tag-danger">PENALTY</span></td><td>감사부</td><td>규정 Δ-7 위반</td><td class="mono" style="text-align:right; color:var(--danger);">−500</td><td class="mono">12,120</td></tr>
        </tbody>
      </table>
    </div>
    <div class="box narrow">
      <div class="panel-title"><span>SHOP · 추천 아이템</span></div>
      <div class="stack-s">
        <div class="spread"><span>방탄 조끼 II</span><span class="mono gold">¤ 3,800</span></div>
        <div class="spread"><span>Δ-차폐 케이스</span><span class="mono gold">¤ 5,500</span></div>
        <div class="spread"><span>의료 키트 확장</span><span class="mono gold">¤ 1,200</span></div>
        <div class="spread"><span>위장 신분증 ×3</span><span class="mono gold">¤ 900</span></div>
      </div>
      <button class="btn btn-sm" style="width:100%; justify-content:center; margin-top:10px;">상점 전체 →</button>
    </div>
  </div>
`;

/* ===================== WIKI ===================== */
SCREENS.wiki = `
  <div class="page-head">
    <div class="titleblock"><div class="breadcrumbs">ERP / CODEX · ZULU</div><h1>위키</h1></div>
    <div class="right"><button class="btn">최근 변경</button><button class="btn">그래프 뷰 <span class="tag tag-p2" style="margin-left:4px;">P2</span></button><button class="btn btn-primary">＋ 새 문서</button></div>
  </div>

  <div class="cols cols-wiki">
    <div class="box wk-nav">
      <div class="eyebrow" style="margin-bottom:10px;">CATEGORIES</div>
      <div class="stack-s" style="font-size:12px;">
        <a class="s-item" style="padding:5px 6px;"><span class="ico">▸</span>인물 (91)</a>
        <a class="s-item" style="padding:5px 6px;"><span class="ico">▸</span>지역 (12)</a>
        <a class="s-item" style="padding:5px 6px;"><span class="ico">▸</span>사건 (67)</a>
        <a class="s-item" style="padding:5px 6px;"><span class="ico">▸</span>조직 (42)</a>
        <a class="s-item active" style="padding:5px 6px;"><span class="ico">▾</span>프로토콜 (28)</a>
        <div style="padding-left:22px; display:flex; flex-direction:column; gap:2px; color:var(--ink-2); font-size:11px;">
          <a style="padding:3px 0;">· Δ-11 기밀 대응</a>
          <a style="padding:3px 0;" class="gold">· Δ-11 외부 계약자 운용</a>
          <a style="padding:3px 0;">· Δ-12 격리 요청</a>
          <a style="padding:3px 0;">· Σ-04 신호 분석</a>
        </div>
        <a class="s-item" style="padding:5px 6px;"><span class="ico">▸</span>용어집 (214)</a>
        <a class="s-item" style="padding:5px 6px;"><span class="ico">▸</span>초안 (18)</a>
      </div>
    </div>

    <div class="box wk-body">
      <div class="spread" style="margin-bottom:10px;">
        <div>
          <div class="eyebrow eyebrow-gold">프로토콜 / Δ-11</div>
          <h2 style="margin-top:4px;">Δ-11 외부 계약자 운용</h2>
        </div>
        <div class="row" style="gap:6px;">
          <span class="tag tag-gold">APPROVED</span>
          <span class="tag">v3.2</span>
          <span class="tag tag-danger">SPOILER · CLR 3+</span>
          <button class="btn">편집</button>
          <button class="btn">히스토리</button>
        </div>
      </div>
      <div class="mono dim" style="font-size:10px; margin-bottom:16px; padding-bottom:10px; border-bottom:1px dashed var(--line);">최종 수정 2026.04.12 · @GM-이현 · 템플릿: PROTOCOL · 승인 @중앙감사부</div>

      <h3 style="margin-bottom:8px;">§1 목적</h3>
      <p class="muted" style="line-height:1.7;">본 프로토콜은 외부 민간 계약자가 NOVUS ORDO 작전 수행에 일시 편입되는 경우의 표준 절차를 정의한다.</p>

      <h3 style="margin:20px 0 8px;">§2 분류</h3>
      <div class="cols cols-3" style="gap:8px; font-size:11px;">
        <div class="box box-solid" style="padding:10px;"><div class="eyebrow eyebrow-gold">L-A</div><div class="mt-s">1회성 정보원</div></div>
        <div class="box box-solid" style="padding:10px;"><div class="eyebrow eyebrow-gold">L-B</div><div class="mt-s">단기 기술 계약자</div></div>
        <div class="box box-solid" style="padding:10px;"><div class="eyebrow eyebrow-gold">L-C</div><div class="mt-s">현장 협력자</div></div>
      </div>

      <h3 style="margin:20px 0 8px;">§3 절차</h3>
      <ol style="color:var(--ink-1); line-height:1.9;">
        <li>지부장 추천 → 중앙사무국 심사 (48h)</li>
        <li>임시 ID 발급 (OP-T-XXXX) 및 클리어런스 0 부여</li>
        <li>작전 종료 후 기억 교란 또는 봉인 결정</li>
        <li>감사 보고서 제출 (72h 이내)</li>
      </ol>

      <h3 style="margin:20px 0 8px;">§4 관련 문서</h3>
      <div class="stack-s">
        <a class="gold">→ Δ-12 격리 요청</a>
        <a class="gold">→ Σ-04 신호 분석</a>
        <a class="gold">→ OP-047 브리핑 (세션 자동 링크)</a>
      </div>
    </div>

    <div class="box wk-toc">
      <div class="eyebrow" style="margin-bottom:10px;">CONTENTS</div>
      <div class="stack-s" style="font-size:11px; font-family:var(--mono); color:var(--ink-2);">
        <a class="gold">§1 목적</a>
        <a>§2 분류</a>
        <a>§3 절차</a>
        <a>§4 관련 문서</a>
        <a>§5 기억 관리</a>
      </div>
      <div class="eyebrow" style="margin:20px 0 10px;">BACKLINKS · 7</div>
      <div class="stack-s" style="font-size:11px;">
        <a>OP-047 브리핑</a>
        <a>OP-042 리포트</a>
        <a>지부: 서울-03</a>
        <a>NPC-0412 파일</a>
      </div>
      <div class="eyebrow" style="margin:20px 0 10px;">HISTORY</div>
      <div class="stack-s" style="font-size:10px; font-family:var(--mono); color:var(--ink-2);">
        <div class="spread"><span>v3.2 → v3.1</span><button class="btn btn-sm">diff</button></div>
        <div class="spread"><span>v3.1 → v3.0</span><button class="btn btn-sm">diff</button></div>
        <div class="spread"><span>v3.0 → v2.9</span><button class="btn btn-sm">diff</button></div>
      </div>
    </div>
  </div>
`;

/* ===================== GALLERY ===================== */
SCREENS.gallery = `
  <div class="page-head">
    <div class="titleblock"><div class="breadcrumbs">ERP / GALLERY</div><h1>갤러리 <span class="tag tag-p0" style="margin-left:10px;">P0</span></h1></div>
    <div class="right"><button class="btn">세션별 앨범</button><button class="btn">팬아트</button><button class="btn btn-primary">＋ 업로드</button></div>
  </div>

  <div class="row" style="margin-bottom:var(--gap); gap:8px;">
    <input class="input" placeholder="태그 · 세션 · 캐릭터" style="flex:1;" />
    <select class="select" style="width:auto;"><option>ALL 앨범</option></select>
    <select class="select" style="width:auto;"><option>최신순</option></select>
  </div>

  <div class="cols cols-4">
    ${Array.from({length:12}).map((_,i)=>`
      <div class="gallery-tile">
        <div class="ph">IMG #${String(i+1).padStart(3,'0')}</div>
        <div class="spread" style="font-size:11px;">
          <span class="mono gold">OP-0${47-i%6}</span>
          <span class="mono dim" style="font-size:10px;">♥ ${12-i}</span>
        </div>
        <div class="mono dim" style="font-size:10px;">${['세션','팬아트','현장','브리핑'][i%4]} · 2026.04</div>
      </div>
    `).join('')}
  </div>
`;

/* ===================== CHRONICLE ===================== */
SCREENS.chronicle = `
  <div class="page-head">
    <div class="titleblock"><div class="breadcrumbs">ERP / CHRONICLE</div><h1>연대기 <span class="tag tag-p2" style="margin-left:10px;">P2</span></h1></div>
    <div class="right"><button class="btn">전체 보기</button><button class="btn">내 캐릭터 오버레이 <span class="tag tag-success" style="margin-left:6px;">ON</span></button></div>
  </div>

  <div class="box">
    <div class="panel-title"><span>WORLD TIMELINE · 2024 — 2026</span><span class="mono dim">통합 뷰</span></div>
    <div class="timeline" style="padding-left:28px;">
      <div class="tl-item"><div class="tl-time">2024.02 · ENLIST</div><div class="tl-body"><span class="tag tag-info">내 캐릭터</span> 카렌 모리츠 서울-03 야전부 수습 배정.</div></div>
      <div class="tl-item"><div class="tl-time">2024.06 · EVENT</div><div class="tl-body"><span class="tag">WORLD</span> 홍콩-01 지부 설립. KR-BALD 초대 지부장.</div></div>
      <div class="tl-item"><div class="tl-time">2024.11 · SESSION</div><div class="tl-body"><span class="tag">SESSION</span> OP-001 "첫 문서" — 프로토콜 Δ-11 최초 발의.</div></div>
      <div class="tl-item"><div class="tl-time">2025.04 · WIKI</div><div class="tl-body"><span class="tag">DOC</span> Δ-11 외부 계약자 운용 v1.0 승인.</div></div>
      <div class="tl-item"><div class="tl-time">2025.09 · EVENT</div><div class="tl-body"><span class="tag tag-danger">KIA</span> OP-028 · 마크 스즈키 사망 — Δ-개체 봉인 성공.</div></div>
      <div class="tl-item"><div class="tl-time">2026.01 · PROMO</div><div class="tl-body"><span class="tag tag-info">내 캐릭터</span> 카렌 CLEARANCE 2 → 3 승급.</div></div>
      <div class="tl-item"><div class="tl-time">2026.04 · UPCOMING</div><div class="tl-body"><span class="tag tag-gold">SESSION</span> OP-047 "은빛 경로" 예정.</div></div>
    </div>
  </div>
`;

/* ===================== NOTIFICATIONS ===================== */
SCREENS.notifications = `
  <div class="page-head">
    <div class="titleblock"><div class="breadcrumbs">ERP / NOTIFICATIONS</div><h1>알림</h1></div>
    <div class="right"><button class="btn">모두 읽음</button><button class="btn">구독 설정 <span class="tag tag-p1" style="margin-left:4px;">P1</span></button></div>
  </div>

  <div class="tabs">
    <div class="tab active">전체 · 14</div><div class="tab">세션 · 5</div><div class="tab">크레딧 · 3</div><div class="tab">위키 · 2</div><div class="tab">감사 · 1</div><div class="tab">Discord · 3</div>
  </div>

  <div class="box">
    ${[
      {tag:'SESSION',t:'tag-gold',title:'OP-047 브리핑이 내일 21:00에 예정되어 있습니다.',sub:'GM 이현 · 서울-03 · Discord 스레드 링크 첨부',time:'09:12',read:false},
      {tag:'AUDIT',t:'tag-danger',title:'CLS-0044 조회 요청이 반려되었습니다.',sub:'사유: CLEARANCE 부족',time:'22:45',read:false},
      {tag:'DISCORD',t:'tag-info',title:'@GM-이현 이 #작전-브리핑 에서 멘션했습니다.',sub:'"OP-047 장비 목록 확인 부탁드립니다 @OP-0208"',time:'19:02',read:false},
      {tag:'CREDITS',t:'tag-success',title:'세션 보상 ¤3,200 이 정산되었습니다.',sub:'',time:'어제',read:true},
      {tag:'WIKI',t:'',title:'구독 문서 "Δ-11 외부 계약자 운용" 업데이트.',sub:'v3.1 → v3.2',time:'04/12',read:true},
      {tag:'SYSTEM',t:'',title:'보안 스캔 완료. 이상 없음.',sub:'',time:'04/10',read:true},
    ].map(n=>`
      <div class="notif ${n.read?'read':''}">
        <span class="mark"></span>
        <div class="notif-body">
          <div class="notif-head">
            <div><span class="tag ${n.t}">${n.tag}</span><span class="strong" style="margin-left:8px;">${n.title}</span></div>
            <span class="mono dim" style="font-size:10px;">${n.time}</span>
          </div>
          ${n.sub?`<div class="muted mt-s" style="font-size:12px;">${n.sub}</div>`:''}
        </div>
      </div>
    `).join('')}
  </div>
`;

/* ===================== PROFILE ===================== */
SCREENS.profile = `
  <div class="page-head">
    <div class="titleblock"><div class="breadcrumbs">ERP / PROFILE</div><h1>프로필</h1></div>
    <div class="right"><button class="btn">편집</button><button class="btn btn-primary">Discord 재연결</button></div>
  </div>

  <div class="cols cols-side-main">
    <div class="box side">
      <div style="text-align:center;">
        <div class="seal seal-lg" style="margin:0 auto;">관</div>
        <h2 class="mt-m">관리자</h2>
        <div class="mono gold mt-s" style="letter-spacing:0.15em;">SUPER_ADMIN</div>
        <div class="mono dim" style="font-size:10px; margin-top:2px;">OP-0412 · SEOUL-03</div>
      </div>
      <div class="row mt-m" style="justify-content:center; gap:6px;">
        <span class="tag tag-gold">CLR 6</span>
        <span class="tag">감사 통과</span>
        <span class="tag">2년차</span>
      </div>
      <dl class="kv mt-m">
        <div class="kv-row"><dt>가입일</dt><dd class="mono">2024.02.11</dd></div>
        <div class="kv-row"><dt>세션</dt><dd>47회</dd></div>
        <div class="kv-row"><dt>마지막 접속</dt><dd class="mono">04/19 · 04:12</dd></div>
      </dl>
    </div>

    <div class="main-col stack">
      <div class="box">
        <div class="panel-title"><span>ACCOUNT</span></div>
        <dl class="kv">
          <div class="kv-row"><dt>아이디</dt><dd class="mono">admin@novusordo.int</dd></div>
          <div class="kv-row"><dt>표시명</dt><dd>관리자</dd></div>
          <div class="kv-row"><dt>지부</dt><dd>서울-03 · 중앙사무국</dd></div>
          <div class="kv-row"><dt>언어</dt><dd>한국어 · English</dd></div>
          <div class="kv-row"><dt>시간대</dt><dd class="mono">Asia/Seoul (UTC+09)</dd></div>
        </dl>
      </div>

      <div class="box">
        <div class="panel-title"><span class="gold">DISCORD LINK</span><span class="tag tag-success">CONNECTED</span></div>
        <dl class="kv">
          <div class="kv-row"><dt>Handle</dt><dd class="mono">admin#0001</dd></div>
          <div class="kv-row"><dt>User ID</dt><dd class="mono">4118···0412</dd></div>
          <div class="kv-row"><dt>Roles</dt><dd>@관리자 · @GM · @감사부</dd></div>
          <div class="kv-row"><dt>봇 명령</dt><dd class="mono">/ordo · 26회</dd></div>
        </dl>
        <div class="row mt-m">
          <button class="btn">봇 명령 문서</button>
          <button class="btn" style="color:var(--danger); border-color:var(--danger);">연결 해제</button>
        </div>
      </div>

      <div class="box">
        <div class="panel-title"><span>NOTIFICATION SUBSCRIPTIONS</span><span class="tag tag-p1">P1</span></div>
        <div class="stack-s" style="font-size:12px;">
          <div class="spread"><span>세션 알림</span><span class="row" style="gap:8px;"><span class="tag">WEB</span><span class="tag tag-info">DISCORD DM</span></span></div>
          <div class="spread"><span>크레딧 변동</span><span class="row" style="gap:8px;"><span class="tag">WEB</span></span></div>
          <div class="spread"><span>위키 구독 변경</span><span class="row" style="gap:8px;"><span class="tag">WEB</span><span class="tag tag-info">DISCORD DM</span></span></div>
          <div class="spread"><span>감사 알림</span><span class="row" style="gap:8px;"><span class="tag">WEB</span></span></div>
        </div>
      </div>

      <div class="box">
        <div class="panel-title"><span>SECURITY</span></div>
        <div class="stack-s" style="font-size:12px;">
          <div class="spread"><span>비밀번호</span><span class="row" style="gap:8px;"><span class="mono dim">90일 전</span><button class="btn btn-sm">재설정</button></span></div>
          <div class="spread"><span>2단계 인증</span><span class="row" style="gap:8px;"><span class="tag tag-success">ACTIVE</span><button class="btn btn-sm">관리</button></span></div>
          <div class="spread"><span>활성 세션</span><span class="row" style="gap:8px;"><span class="mono">3 devices</span><button class="btn btn-sm">보기</button></span></div>
        </div>
      </div>
    </div>
  </div>
`;

/* ===================== ADMIN (unified) ===================== */
SCREENS.admin = `
  <div class="page-head">
    <div class="titleblock"><div class="breadcrumbs">ADMIN</div><h1>관리자</h1></div>
    <div class="right"><button class="btn">감사 로그</button><button class="btn btn-primary">＋ 초대</button></div>
  </div>

  <div class="tabs">
    <div class="tab active">사용자</div><div class="tab">부서 / 조직</div><div class="tab">경제 대시보드</div><div class="tab">시스템 로그</div>
  </div>

  <div class="cols cols-4" style="margin-bottom:var(--gap);">
    ${[['USERS',247,'gold'],['ACTIVE',189,'success'],['PENDING',8,'info'],['SUSPENDED',3,'danger']].map(([k,v,t])=>`
      <div class="box">
        <div class="eyebrow">${k}</div>
        <div class="big-num" style="color:var(--${t});">${v}</div>
      </div>
    `).join('')}
  </div>

  <div class="cols cols-wide-narrow">
    <div class="box wide">
      <div class="panel-title"><span>USERS</span><span class="mono dim">총 247명</span></div>
      <div class="row" style="gap:8px; margin-bottom:10px;">
        <input class="input" placeholder="이름 · 이메일 · 디스코드 ID" style="flex:1;" />
        <select class="select" style="width:auto;"><option>ROLE: ALL</option></select>
        <select class="select" style="width:auto;"><option>지부: ALL</option></select>
      </div>
      <table class="t">
        <thead><tr><th></th><th>이름</th><th>이메일</th><th>ROLE</th><th>CLR</th><th>디스코드</th><th>지부</th><th>STATUS</th><th></th></tr></thead>
        <tbody>
          <tr><td><div class="seal seal-sm">관</div></td><td class="strong">관리자</td><td class="mono">admin@novusordo.int</td><td class="gold mono">SUPER</td><td class="mono">6</td><td class="mono dim">admin#0001</td><td>서울-03</td><td><span class="tag tag-success">ACTIVE</span></td><td><button class="btn btn-sm">···</button></td></tr>
          <tr><td><div class="seal seal-sm">이</div></td><td class="strong">이현</td><td class="mono">gm.lee@novusordo.int</td><td class="mono">GM</td><td class="mono">5</td><td class="mono dim">gmlee#2411</td><td>서울-03</td><td><span class="tag tag-success">ACTIVE</span></td><td><button class="btn btn-sm">···</button></td></tr>
          <tr><td><div class="seal seal-sm">K</div></td><td class="strong">KR-BALD</td><td class="mono">krbald@novusordo.int</td><td class="mono">GM</td><td class="mono">4</td><td class="mono dim">krbald#7711</td><td>홍콩-01</td><td><span class="tag tag-success">ACTIVE</span></td><td><button class="btn btn-sm">···</button></td></tr>
          <tr><td><div class="seal seal-sm">아</div></td><td>아리사</td><td class="mono">arisa@novusordo.int</td><td class="mono">GM</td><td class="mono">4</td><td class="mono dim">arisa#0099</td><td>도쿄-02</td><td><span class="tag tag-success">ACTIVE</span></td><td><button class="btn btn-sm">···</button></td></tr>
          <tr><td><div class="seal seal-sm">E</div></td><td>엘리 블랙웰</td><td class="mono">e.blackwell@novusordo.int</td><td class="mono">PLAYER</td><td class="mono">2</td><td class="mono dim">ellie#4421</td><td>런던-01</td><td><span class="tag">PENDING</span></td><td><button class="btn btn-sm">···</button></td></tr>
          <tr><td><div class="seal seal-sm">X</div></td><td class="muted">X.N</td><td class="mono dim">xn@███</td><td class="mono dim">—</td><td class="mono">1</td><td class="mono dim">suspended</td><td>외부</td><td><span class="tag tag-danger">SUSP</span></td><td><button class="btn btn-sm">···</button></td></tr>
        </tbody>
      </table>
    </div>

    <div class="narrow stack">
      <div class="box">
        <div class="panel-title"><span>DEPARTMENTS · 7</span></div>
        <div class="stack-s" style="font-size:12px;">
          <div class="spread"><span><span class="mono gold">DEP-01</span> 중앙사무국</span><span class="mono">12</span></div>
          <div class="spread"><span><span class="mono">DEP-02</span> 야전 운용부</span><span class="mono">38</span></div>
          <div class="spread"><span><span class="mono">DEP-03</span> 분석부</span><span class="mono">22</span></div>
          <div class="spread"><span><span class="mono">DEP-04</span> 감사부</span><span class="mono">6</span></div>
          <div class="spread"><span><span class="mono">DEP-05</span> 기술개발부</span><span class="mono">17</span></div>
          <div class="spread"><span><span class="mono">DEP-06</span> 의료부</span><span class="mono">9</span></div>
          <div class="spread"><span><span class="mono">DEP-07</span> 외부 계약자</span><span class="mono">23</span></div>
        </div>
      </div>

      <div class="box box-gold">
        <div class="panel-title"><span class="gold">ECONOMY</span><span class="tag tag-p2">P2</span></div>
        <div class="stack-s" style="font-size:12px;">
          <div class="spread"><span>유통량 ¤</span><span class="mono gold">3.24M</span></div>
          <div class="spread"><span>이번 주 발행</span><span class="mono">＋42k</span></div>
          <div class="spread"><span>소각</span><span class="mono" style="color:var(--danger);">−18k</span></div>
          <div class="spread"><span>인플레 지표</span><span class="mono">+1.2%</span></div>
        </div>
        <div class="spark mt-m">${Array.from({length:20}).map((_,i)=>`<span style="height:${30+Math.abs(Math.cos(i*1.1))*60}%;"></span>`).join('')}</div>
      </div>

      <div class="box">
        <div class="panel-title"><span>PROMOTION QUEUE</span></div>
        <div class="stack-s" style="font-size:12px;">
          <div class="spread"><span><span class="mono gold">@OP-0208</span> · CLR 3→4</span><button class="btn btn-sm">검토</button></div>
          <div class="spread"><span><span class="mono">@OP-0133</span> · 분석 → 선임</span><button class="btn btn-sm">검토</button></div>
          <div class="spread"><span><span class="mono">@OP-T-0044</span> → 정식</span><button class="btn btn-sm">검토</button></div>
        </div>
      </div>
    </div>
  </div>
`;

/* ===================== IDENTITY DETAIL (Dossier v2) ===================== */
SCREENS['identity-detail'] = `
  <div class="page-head">
    <div class="titleblock">
      <div class="breadcrumbs"><a data-go="identity" class="gold">‹ PERSONNEL</a> / SECRETARIAT / RESEARCH / OP-0412</div>
      <h1>하세가와 아야 <span class="mono dim" style="font-size:13px; margin-left:10px; letter-spacing:0.15em;">HASEGAWA AYA</span></h1>
    </div>
    <div class="right">
      <span class="clr-pill">MY CLR · H <span class="clr-dots"><span class="on"></span><span class="on"></span><span class="on"></span><span></span><span></span><span></span></span></span>
      <button class="btn btn-sm">← 복귀</button>
      <button class="btn btn-sm">⇣ PDF</button>
    </div>
  </div>

  <!-- Read-only + masking notice -->
  <div class="notice danger" style="margin-bottom:var(--gap);">
    <span class="label">READ-ONLY</span>
    <span>이 Dossier는 서버에서 마스킹된 후 전달됩니다. 일부 섹션은 <strong style="color:var(--gold);">M · Memorian</strong> 이상 필요.</span>
    <span class="mono dim" style="margin-left:auto; font-size:9px;">AUDIT #AUD-00412 · 04/20 04:21</span>
  </div>

  <div class="cols cols-side-main">

    <!-- ========== LEFT: Side panel ========== -->
    <div class="side stack">
      <!-- Portrait / Seal -->
      <div class="box box-gold" style="text-align:center;">
        <div class="ph" style="aspect-ratio:3/4; max-width:220px; margin:0 auto;">IDENT PHOTO<br/>— OP-0412 —</div>
        <h2 class="mt-m">하세가와 아야</h2>
        <div class="mono gold" style="font-size:10px; letter-spacing:0.2em; margin-top:4px;">OP-0412</div>
        <div class="mono dim" style="font-size:10px; margin-top:2px;">HASEGAWA AYA</div>
        <div class="row mt-m" style="justify-content:center; gap:6px; flex-wrap:wrap;">
          <span class="tag">AGENT</span>
          <span class="tag">DORMANT</span>
        </div>
        <div class="row mt-s" style="justify-content:center;">
          <span class="clr-pill">TARGET CLR · M <span class="clr-dots"><span class="on"></span><span class="on"></span><span class="on"></span><span class="on"></span><span></span><span></span></span></span>
        </div>
      </div>

      <!-- KV sidebar : identity group (CLR G 필요, 내 CLR=H → 노출) -->
      <div class="box">
        <div class="panel-title">
          <span>IDENTITY</span>
          <span class="req-clr">G 필요 · 열람 가능</span>
        </div>
        <dl class="kv">
          <div class="kv-row"><dt>CODE</dt><dd class="mono gold">OP-0412</dd></div>
          <div class="kv-row"><dt>실명</dt><dd>하세가와 아야</dd></div>
          <div class="kv-row"><dt>성별</dt><dd>여</dd></div>
          <div class="kv-row"><dt>나이</dt><dd>31</dd></div>
          <div class="kv-row"><dt>신장</dt><dd class="mono">168 cm</dd></div>
          <div class="kv-row"><dt>소속</dt><dd>사무국 · 연구 기구</dd></div>
        </dl>
      </div>

      <!-- AUDIT : meta (V 필요, 내 CLR=H → LOCKED) -->
      <div class="box">
        <div class="panel-title">
          <span>AUDIT</span>
          <span class="req-clr locked">V 필요 · 잠김</span>
        </div>
        <div class="sec-locked" style="padding:18px;">
          <div class="lock-icon">⚿</div>
          <div class="lock-title">CLASSIFIED · V</div>
          <div class="lock-sub">OWNER / CREATED / UPDATED<br/>Voidwalker 등급 필요</div>
        </div>
      </div>

      <!-- Fields summary -->
      <div class="box">
        <div class="panel-title"><span>CLEARANCE MAP</span></div>
        <div class="stack-s" style="font-size:11px;">
          <div class="spread"><span>IDENTITY</span><span class="mono gold">G · 열람</span></div>
          <div class="spread"><span>PROFILE</span><span class="mono gold">H · 열람</span></div>
          <div class="spread"><span>COMBAT STATS</span><span class="mono gold">H · 열람</span></div>
          <div class="spread"><span>ABILITIES</span><span class="mono" style="color:var(--danger);">M · 잠김</span></div>
          <div class="spread"><span>META</span><span class="mono" style="color:var(--danger);">V · 잠김</span></div>
        </div>
        <div class="mono dim mt-m" style="font-size:9px; text-align:center;">상위 등급 필요 필드 · 2</div>
        <button class="btn btn-sm" style="width:100%; justify-content:center; margin-top:10px;">등급 상승 요청 →</button>
      </div>
    </div>

    <!-- ========== RIGHT: Main ========== -->
    <div class="main-col stack">

      <!-- Tabs (비활성 라벨 포함) -->
      <div class="tabs">
        <div class="tab active">DOSSIER</div>
        <div class="tab">관계 · 7</div>
        <div class="tab">세션 출현 · 12</div>
        <div class="tab">감사 로그 <span class="tag" style="margin-left:4px; font-size:8px;">V</span></div>
      </div>

      <!-- CHARACTER PROFILE (H 필요, 내 CLR=H → 열람) -->
      <div class="box">
        <div class="panel-title">
          <span>CHARACTER PROFILE</span>
          <span class="req-clr">H 필요 · 열람 가능</span>
        </div>
        <div class="cols cols-2" style="margin-top:4px;">
          <div>
            <div class="eyebrow">APPEARANCE · 외형</div>
            <p style="color:var(--ink-1); line-height:1.8; margin:6px 0 0;">
              162–168cm · 검은 단발 · 좌측 쇄골 부근 화상 흔적(█.█cm). 주로 짙은 회색 코트와 뿔테 안경. 조용한 인상이나 시선이 매섭다.
            </p>
          </div>
          <div>
            <div class="eyebrow">PERSONALITY · 성격</div>
            <p style="color:var(--ink-1); line-height:1.8; margin:6px 0 0;">
              분석적이고 집요한 사서 기질. 숫자와 패턴을 신뢰하며 직감은 2차 검증 후에만 믿는다. 팀원을 챙기지만 감정 표현은 인색하다.
            </p>
          </div>
        </div>
        <div class="mt-m">
          <div class="eyebrow">BACKGROUND · 배경</div>
          <p style="color:var(--ink-1); line-height:1.8; margin:6px 0 0;">
            ████ 대학 문헌학 박사. 민간 시절 Δ-구역 신호 패턴을 독자 수집한 기록이 발각되어 2022년 8월 도쿄-02로 스카우트.
            OP-024 "잿빛 사서" 사건에서 클라이맥스 출현, 그 이후 CLR 승급.
          </p>
        </div>
        <div class="mt-m" style="padding:12px 16px; border-left:2px solid var(--gold); background:rgba(201,168,90,0.04); font-family:var(--mono); font-size:12px; color:var(--ink-1);">
          "숫자는 내가 봐주는 게 아니라, 내가 번역할 뿐이야."
          <span class="mono dim" style="display:block; margin-top:6px; font-size:10px; letter-spacing:0.15em;">— QUOTE · OP-024 after-action</span>
        </div>
      </div>

      <!-- COMBAT STATS (AGENT 전용, H 필요, 내 CLR=H → 열람) -->
      <div class="box">
        <div class="panel-title">
          <span>COMBAT STATS · AGENT</span>
          <span class="req-clr">H 필요 · 열람 가능</span>
        </div>
        <div class="cols cols-4" style="gap:10px;">
          <div class="box box-solid" style="padding:12px; text-align:center;">
            <div class="eyebrow">HP</div>
            <div class="mono gold" style="font-size:26px; margin-top:4px;">42<span class="mono dim" style="font-size:12px;"> / 60</span></div>
            <div class="bar mt-s"><span style="width:70%;"></span></div>
          </div>
          <div class="box box-solid" style="padding:12px; text-align:center;">
            <div class="eyebrow">SAN</div>
            <div class="mono gold" style="font-size:26px; margin-top:4px;">38<span class="mono dim" style="font-size:12px;"> / 70</span></div>
            <div class="bar bar-danger mt-s"><span style="width:54%;"></span></div>
          </div>
          <div class="box box-solid" style="padding:12px; text-align:center;">
            <div class="eyebrow">DEF</div>
            <div class="mono gold" style="font-size:26px; margin-top:4px;">14</div>
            <div class="bar mt-s"><span style="width:46%;"></span></div>
          </div>
          <div class="box box-solid" style="padding:12px; text-align:center;">
            <div class="eyebrow">ATK</div>
            <div class="mono gold" style="font-size:26px; margin-top:4px;">22</div>
            <div class="bar mt-s"><span style="width:61%;"></span></div>
          </div>
        </div>
      </div>

      <!-- AGENT DETAILS (M 필요, 내 CLR=H → LOCKED) -->
      <div class="box">
        <div class="panel-title">
          <span>AGENT DETAILS</span>
          <span class="req-clr locked">M 필요 · 잠김</span>
        </div>
        <div class="cols cols-3">
          <div class="stat-locked">
            <div class="eyebrow">CLASS</div>
            <div class="v mt-s">[CLASSIFIED · M]</div>
          </div>
          <div class="stat-locked">
            <div class="eyebrow">ABILITY TYPE</div>
            <div class="v mt-s">[CLASSIFIED · M]</div>
          </div>
          <div class="stat-locked">
            <div class="eyebrow">CREDIT</div>
            <div class="v mt-s">████ ¤</div>
          </div>
          <div class="stat-locked">
            <div class="eyebrow">WEAPON TRAINING</div>
            <div class="v mt-s">[CLASSIFIED · M]</div>
          </div>
          <div class="stat-locked">
            <div class="eyebrow">SKILL TRAINING</div>
            <div class="v mt-s">[CLASSIFIED · M]</div>
          </div>
          <div class="stat-locked">
            <div class="eyebrow">WEIGHT</div>
            <div class="v mt-s">██ kg</div>
          </div>
        </div>
        <div class="notice danger mt-m">
          <span class="label">LOCKED</span>
          <span>하위 <strong style="color:var(--ink-0);">ABILITIES · EQUIPMENT</strong> 목록도 동일하게 <strong style="color:var(--gold);">M</strong> 등급부터 표시됩니다.</span>
          <button class="btn btn-sm" style="margin-left:auto;">등급 상승 요청</button>
        </div>
      </div>

      <!-- ABILITIES (M) - locked preview -->
      <div class="box">
        <div class="panel-title">
          <span>ABILITIES</span>
          <span class="req-clr locked">M 필요 · 잠김</span>
        </div>
        <div class="stack-s" style="font-size:12px;">
          <div class="spread" style="padding:10px 12px; border:1px dashed var(--line-strong);">
            <span><span class="mono dim">AB-████</span> <span class="redact-block" style="width:140px; margin-left:8px;"></span></span>
            <span class="classified-tag">CLR · M</span>
          </div>
          <div class="spread" style="padding:10px 12px; border:1px dashed var(--line-strong);">
            <span><span class="mono dim">AB-████</span> <span class="redact-block" style="width:200px; margin-left:8px;"></span></span>
            <span class="classified-tag">CLR · M</span>
          </div>
          <div class="spread" style="padding:10px 12px; border:1px dashed var(--line-strong);">
            <span><span class="mono dim">AB-████</span> <span class="redact-block" style="width:160px; margin-left:8px;"></span></span>
            <span class="classified-tag">CLR · M</span>
          </div>
        </div>
        <div class="mono dim mt-m" style="font-size:9px; letter-spacing:0.15em;">3 항목 · 전체 마스킹</div>
      </div>

      <!-- EQUIPMENT (M) - locked preview -->
      <div class="box">
        <div class="panel-title">
          <span>EQUIPMENT</span>
          <span class="req-clr locked">M 필요 · 잠김</span>
        </div>
        <div class="grid-cards" style="grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));">
          <div class="stat-locked" style="padding:14px;">
            <div class="mono gold" style="font-size:10px;">EQ-████</div>
            <div class="v mt-s">[CLASSIFIED · M]</div>
          </div>
          <div class="stat-locked" style="padding:14px;">
            <div class="mono gold" style="font-size:10px;">EQ-████</div>
            <div class="v mt-s">[CLASSIFIED · M]</div>
          </div>
          <div class="stat-locked" style="padding:14px;">
            <div class="mono gold" style="font-size:10px;">EQ-████</div>
            <div class="v mt-s">[CLASSIFIED · M]</div>
          </div>
          <div class="stat-locked" style="padding:14px;">
            <div class="mono gold" style="font-size:10px;">EQ-████</div>
            <div class="v mt-s">[CLASSIFIED · M]</div>
          </div>
        </div>
      </div>

      <!-- NPC DETAILS - not shown because AGENT; informational variant hint -->
      <div class="box" style="border-style:dashed;">
        <div class="panel-title">
          <span class="mono dim">NPC DETAILS</span>
          <span class="mono dim" style="font-size:9px;">— AGENT 캐릭터이므로 표시되지 않음 (NPC 전용 섹션)</span>
        </div>
      </div>

    </div>
  </div>
`;
