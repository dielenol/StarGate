import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(`${process.cwd()}/package.json`);
const { MongoClient } = require("mongodb");

const AUTHOR_ID = "novus-ordo-record-control";
const AUTHOR_NAME = "NOVUS ORDO 사무국 기록통제실 연구원 N. Voss";
const SESSION_CREATED_AT = new Date("2026-03-15T15:00:00.000Z");

const DELETE_SLUGS = [
  "white-noise-containment",
  "sector-a-experimental-unit",
  "cheollian",
  "korean-nis-contact",
  "south-korea-radio-tower-incident",
  "zulu-history-erasure",
  "electromagnetic-storm-cover",
];

function loadEnv() {
  const envText = fs.readFileSync(".env", "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

function source(pages) {
  return `노부스 오르도 사무국 기록통제실 보존본 「S1E1 질서」, 원본 로그 ${pages}.`;
}

const KEPT_PAGES = [
  {
    slug: "s1e1-order",
    title: "작전기록 S1E1: 질서",
    category: "작전기록",
    tags: ["S1E1", "한반도 남부", "검열된 비명", "현장보고"],
    content: `# 작전기록 S1E1: 질서

작전기록 S1E1: 질서는 신규 현장 행정직 스타크 일로니손이 블랙 피라미드에 합류한 뒤, 한반도 남부에서 감지된 줄루 위협 검열된 비명을 추적하고 격리한 첫 현장 기록이다. 단발 접촉, 커버스토리, 현장 절차, 기록 말소는 별도 위키 문서가 아니라 본 작전기록의 하위 사건으로 보존한다.

## 요약 정보
분류: 작전기록
작전지: 미국 맨해튼 블랙 피라미드, 한반도 남부 산악 라디오 시설
관련 개체: 검열된 비명, ZULU-0028
주요 목표: 지역 패닉 억제, 줄루 히스토리 말소, 가능 시 생포
주요 결과: 주민 대피 성공, 지역 패닉 1단계, 검열된 비명 임시 격리
기록 확정도: 확인됨

## 진행 정보
로그 기준 진행일은 2026년 3월 15일부터 2026년 3월 16일이다. 극중 첫 장면은 2025년 10월 23일, 미국 맨해튼의 블랙 피라미드에서 시작한다.

스타크 일로니손은 신입으로 사무국에 도착해 빅보이, GP03-RX780, 수잔 델라웨어, 해쉬 테거, 마가렛, 우디 등을 만난다. 같은 시점에 키아나와 시유는 마리아의 감독 아래 모의 전투 평가를 받고 부적격 판정을 받는다.

## 작전 브리핑과 편성
수잔 델라웨어는 천리안들이 한반도 남부에서 새 줄루 위협을 감지했다고 보고한다. 이 감지망의 실체는 아직 확정하지 않고, 이번 작전의 탐지 출처로만 기록한다.

마리아는 스타크, 빅보이, 키아나, 시유 등을 한 팀으로 묶어 운용한다. 관료·과학자·군인·실험체라는 설명은 노부스 오르도 전체 조직도를 새로 정의한 것이 아니라, S1E1에서 드러난 임시 혼성팀의 성격으로 정리한다.

## 외부 접촉과 요구 충돌
현장팀은 한국 정보기관 요원과 접촉한다. 요원은 군부 측 요구로서 해당 줄루 개체의 파괴 또는 인도, 목격자와 피해자의 사살 후 은폐를 전달한다. 이 요구는 세계이사회의 생포 및 기록 말소 방침과 충돌했고, 노부스 오르도 현장팀은 이후 군부 제안을 거절한다.

화이트로즈 소속 기자는 주민 피해와 과거 위장 시설, 1980년대부터 이어진 고주파 피해, 비밀 보고서와 USB 자료를 언급한다. 해당 기자와 조직의 성격은 화이트로즈 문서에서 별도 보존한다.

## 주민 대피와 은폐 발표
스타크는 괴물이나 미지의 습격이 아니라 희귀한 국지성 전자기 폭풍이 발생했다는 커버스토리로 기자회견을 진행한다. 발표는 성공했고, 마을 주민들은 사흘 뒤 모두 마을을 떠난다.

세계이사회는 지역 패닉을 2단계로 유지하라고 지시했으나, 현장팀은 주민 대피와 은폐 발표를 통해 대외 혼란을 1단계까지 낮춘 것으로 기록된다. 기자회견 비용은 로그상 1400 크레딧과 700 크레딧이 함께 나타나므로 GM 확인이 필요한 회계 항목으로 남긴다.

## 라디오 타워 조우와 격리
드론 정찰 결과 산악 시설에 라디오 타워가 발견되며, 미군 관할 시설이라는 표식도 확인된다. 현장팀은 시설 내부에서 거대한 형체로 웅크린 검열된 비명을 발견한다.

개체는 음파와 금지어, 단어, 자음, 깨진 음절을 이용한 전투 패턴을 보인다. 현장팀은 개체의 귀와 청각 기능을 무력화하고, GP03-RX780의 백색소음 프로토콜과 임시 상자 격리를 통해 생포한다. 백색소음 격리 조건은 검열된 비명 문서에 통합한다.

## 기록 말소와 후속 쟁점
화이트로즈 기자가 확보했던 USB와 문서는 작전 후반부의 핵심 쟁점이 된다. 해쉬 테거는 공개 필요성을 주장하지만, 마리아와 다른 관료진은 말소를 선택한다.

마리아는 최종적으로 문서와 USB를 먹어치우는 방식으로 제거한다. 이 장면은 노부스 오르도가 인간 보호 기관인지, 세계이사회와 줄루 통제를 위한 기관인지에 대한 내부 논쟁을 남긴다.

## 관련 문서
검열된 비명, 줄루, 지역 패닉, MANUS 현장 분류, 화이트로즈, 블랙 피라미드

## 출처
${source("p.1-p.108")}`,
  },
  {
    slug: "censored-scream",
    title: "검열된 비명",
    category: "개체",
    tags: ["S1E1", "ZULU-0028", "줄루", "음파", "백색소음"],
    content: `# 검열된 비명

검열된 비명은 S1E1 질서에서 확인되어 격리된 줄루 개체다. 격리 개체 아카이브에서는 ZULU-0028로 등록되어 있으며, 음파와 청각 자극을 매개로 인간의 정신과 신체에 영향을 주는 개체로 기록된다.

![검열된 비명 - ZULU-0028](/assets/wiki/entities/zulu-0028.webp "ZULU-0028 격리 개체 아카이브 도판")

## 요약 정보
분류: 줄루 개체
격리 번호: ZULU-0028
첫 등장: S1E1 질서
발견지: 한반도 남부 산악 라디오 시설
현재 상태: 격리 중
격리 등급: DANGEROUS
격리율: 50%
격리 위치: 격리구역 지하, 방음시설
기록 확정도: 존재와 격리 결과는 확인됨, 과거 피해 규모는 증언 기반

## 특성
검열된 비명은 높은 고주파 공격을 가하며, 일대에 난치성 정신병을 유발할 수 있는 것으로 보고되었다. 현장 증언에 따르면 피해는 1980년대부터 이어졌고, 영향 반경은 약 4km에서 5km 범위로 추정된다.

개체는 검은 노이즈로 뒤덮인 인간형 형체로 기록된다. 윤곽선은 끊임없이 떨리며, 수신 불량 TV 화면처럼 지직거린다. 소리를 지를 때마다 주변의 문자, 표지판, 화면 속 글씨가 깨지고 뒤섞이는 현상이 동반된다.

소리와 음절에 강하게 반응한다. 전투 중에는 금지어, 단어, 자음, 깨진 음절이 전술적 패턴으로 나타났으며, 가장 큰 소리가 나는 곳에 집중하는 습성이 관찰되었다. 소음이 커질수록 피해가 강화되는 양상도 확인된다.

## 작중 행적
드론 정찰 과정에서 산악 라디오 시설 내부의 거대한 형체가 포착된다. 개체는 드론을 인지한 뒤 음성 또는 음파 현상으로 장비를 손상시켰고, 이후 현장팀과 직접 조우했다.

전투 과정에서 현장팀은 개체가 청각 자극에 의존한다는 점을 파악한다. 오틸리아의 분석은 개체가 증폭될수록 불안정해지는 심리를 가진다는 방향으로 수렴했고, GP03-RX780과 현장 관료진은 백색소음 환경을 이용한 격리를 시도했다.

## 대응 및 격리
개체의 귀와 청각 기능을 무력화하고, 백색소음만 존재하는 공간에 가두는 방식이 임시 격리 절차로 채택되었다. 최종적으로 검열된 비명은 GP03-RX780의 백색소음 프로토콜과 임시 상자 격리를 통해 생포된다.

격리 개체 아카이브에는 현재 격리 위치가 격리구역 지하 방음시설로 기재되어 있다. 격리 조건은 백색소음이 지속되는 방음시설에 단독 격리하는 방식이며, 격리율은 50%로 표시된다.

## 샘플
기대되는 샘플은 깨진 음절과 아직 식별되지 않은 추가 샘플로 기록되어 있다. 깨진 음절은 개체의 발성, 문자 왜곡, 음절 단위 전투 패턴과 연결될 가능성이 있다.

## 관련 문서
줄루, 작전기록 S1E1: 질서, 지역 패닉

## 출처
${source("p.30-p.33, p.45, p.60-p.61, p.74-p.103")}
NOVUS ORDO 격리 개체 아카이브 「ZULU-0028 검열된 비명」, DOCUMENT REVISION 2026.03, CLEARANCE LEVEL G+.`,
  },
  {
    slug: "white-rose",
    title: "화이트로즈",
    category: "세력",
    tags: ["S1E1", "인권단체", "시민사회", "기자"],
    content: `# 화이트로즈

화이트로즈는 S1E1 질서에서 언급된 글로벌 인권 운동 단체다. 한국 정보기관 요원은 이들을 그린피스와 유사한 부류로 설명하며, 인간 보호를 외치는 시민사회 세력으로 경계한다.

## 요약 정보
분류: 세력
성격: 글로벌 인권 운동 단체
첫 등장: S1E1 질서
현장 표식: 하얀 장미 뱃지
기록 확정도: 존재와 현장 기자의 소속은 확인됨, 조직 규모는 검토필요

## 현장 등장
한반도 남부 작전 지역에서 한 기자가 하얀 장미 뱃지를 달고 주민들에게 대피를 촉구한다. 수잔 델라웨어는 그 뱃지를 보고 화이트로즈라고 식별한다.

기자는 군부의 과거 위장 시설, 오래된 피해, 비밀 보고서, USB 사본을 보유하고 있었다. 그는 주민들의 피해 보상과 치료, 피해 자료의 언론 공개를 요구한다.

## 조직 성격
기자의 발언에 따르면 화이트로즈는 글로벌 인권 단체이며 점조직처럼 움직인다. 정부 권위에 직접 도전하려는 목적보다는 피해자를 조명하고 돕는 활동을 한다고 주장한다.

## 노부스 오르도와의 관계
노부스 오르도 현장팀은 처음에는 정체를 숨긴 채 정보를 캐려 했고, 이후 시민 대피를 조건으로 자료를 넘기도록 압박했다. 기자는 생존했지만, 최종적으로 USB와 문서는 말소되었다.

## 관련 문서
작전기록 S1E1: 질서, 검열된 비명

## 출처
${source("p.45-p.68, p.103-p.107")}`,
  },
  {
    slug: "zulu",
    title: "줄루",
    category: "개념",
    tags: ["S1E1", "비정상현상", "전략적 변수", "노부스 오르도"],
    content: `# 줄루

줄루는 노부스 오르도가 비정상 현상과 개체를 작전 대상으로 묶어 부르는 핵심 개념이다. 세계의 균열에서 발생하는 미스터리한 이상 현상, 괴현상, 혹은 인간에게 위협을 유발하는 개체가 이 분류에 들어간다.

## 요약 정보
분류: 핵심 개념
공식 맥락: 노부스 오르도 공개 작전 내규
S1E1 사례: 검열된 비명
작전 목표: 확보, 격리, 파괴 또는 정보 통제
기록 확정도: 기본 개념은 로어북 기준, S1E1 사례는 확인됨

## 개요
노부스 오르도의 목표는 줄루를 포획하거나 파괴하여 사회 안정성을 유지하는 것이다. 모든 줄루가 같은 방식으로 대응되는 것은 아니며, 개체마다 특성, 약점, 격리 조건이 다르다.

현장 요원은 전투와 상호작용을 통해 줄루의 특성과 약점을 파악한다. 경우에 따라 고유한 샘플이나 능력 운용이 발생할 수 있으며, 이는 별도 규정과 GM 판단에 따라 처리된다.

## S1E1 사례
S1E1 질서에서 검열된 비명은 줄루 위협으로 감지된다. 세계이사회는 해당 개체를 생포하고 지역의 줄루 히스토리를 말소하라고 요구한다. 한국 군부는 파괴 또는 인도를 요구했고, 시민사회 측에서는 사망자 0명과 피해 자료 공개를 요구했다.

이 충돌은 줄루 대응이 단순한 전투가 아니라, 정보 통제와 격리, 외부 세력과의 협상, 민간 피해 관리까지 포함하는 작전이라는 점을 보여준다.

## 관련 문서
검열된 비명, 지역 패닉, 작전기록 S1E1: 질서

## 출처
노부스 오르도 공개 작전 내규 「작전 내규 브리핑」, Zulu 항목.
${source("p.30-p.33, p.42-p.45, p.55, p.74-p.103")}`,
  },
  {
    slug: "panic-level",
    title: "지역 패닉",
    category: "규정",
    tags: ["S1E1", "작전규정", "민간통제", "위험단계"],
    content: `# 지역 패닉

지역 패닉은 줄루 및 비정상 현상으로 인한 민간 혼란과 언론 노출 위험을 1단계부터 6단계까지 수치화한 현장 규정이다. 작전 종료 시 패닉 단계는 보상, 감사, 예산에 직접 영향을 줄 수 있다.

## 요약 정보
분류: 현장 규정
공식 범위: 1-6단계
관련 세션: S1E1 질서
기록 확정도: 기본 규정은 로어북 기준, S1E1 적용 사례는 확인됨

## 단계
1단계는 인명 피해가 없는 교통사고 수준이다. 2단계는 소수의 인명 피해가 있는 교통사고, 3단계는 다수의 인명 피해가 있는 교통사고에 대응한다.

4단계는 국소 재난 사고, 5단계는 대규모 재난 주의보, 6단계는 계엄령에 해당한다. 높은 단계로 사건이 종료되면 기관 감사와 예산 삭감 위험이 커진다.

## S1E1 적용 사례
S1E1 질서 작전에서 세계이사회는 지역 패닉을 2단계로 유지하라고 지시했다. 현장팀은 전자기 폭풍 은폐 발표와 주민 대피를 통해 대외 혼란을 1단계까지 낮춘 것으로 기록된다.

## 관련 문서
줄루, 작전기록 S1E1: 질서

## 출처
노부스 오르도 공개 작전 내규 「작전 내규 브리핑」, 지역 패닉 항목.
${source("p.30-p.33, p.69-p.73")}`,
  },
  {
    slug: "black-pyramid",
    title: "블랙 피라미드",
    category: "장소",
    tags: ["S1E1", "노부스 오르도", "맨해튼", "사무국"],
    content: `# 블랙 피라미드

블랙 피라미드는 미국 맨해튼에 위치한 노부스 오르도 사무국 건물이다. S1E1 질서의 첫 장면은 스타크 일로니손이 이곳에 도착하는 장면으로 시작한다.

## 요약 정보
분류: 장소
위치: 미국 맨해튼
소속: 노부스 오르도 사무국
주요 기능: 행정, 연구, 실험, 브리핑, 작전 출발
기록 확정도: 위치와 기능은 확인됨, 세부 층별 구조는 검토필요

## 개요
블랙 피라미드는 기원을 알 수 없는 신비로운 건축물로 묘사된다. 내부에는 단조로운 삼각형 구조물로 이루어진 긴 복도가 있으며, 각 부서로 향하는 사무국 인원들이 바쁘게 이동한다.

## 내부 기능
건물 내부에는 사무국 행정 구역, 연구 및 실험 구역, 모의 전투실, 브리핑 룸이 존재한다. 120층에는 항공기 이륙 시설이 있으며, 현장팀은 이곳에서 한국 작전지로 출발한다.

## 관련 인물
스타크 일로니손은 이곳에서 신입으로 첫 출근한다. 수잔 델라웨어, 해쉬 테거, 마가렛, 우디, GP03-RX780, 마리아, 키아나, 시유, 빅보이, Mr. 오드 등이 같은 에피소드에서 블랙 피라미드 내부에 등장한다.

## 관련 문서
작전기록 S1E1: 질서, MANUS 현장 분류

## 출처
${source("p.1-p.7, p.25-p.39")}`,
  },
  {
    slug: "novus-ordo-field-classes",
    title: "MANUS 현장 분류",
    category: "규정",
    tags: ["S1E1", "MANUS", "섹터", "현장운용"],
    content: `# MANUS 현장 분류

MANUS 현장 분류는 노부스 오르도가 현장 인력을 배치하고 운용할 때 사용하는 기본 분류체계다. MANUS의 기본 구조는 섹터 A-E 배치를 따르며, S1E1의 관료·과학자·군인·실험체 구분은 해당 작전에서 드러난 혼성팀 설명으로 다룬다.

## 요약 정보
분류: 현장 규정
관련 기관: MANUS
관련 세션: S1E1 질서
기록 확정도: MANUS 섹터 구조는 스펙 문서 기준, S1E1 혼성팀 묘사는 세션 로그 기준

## MANUS 기본 구조
MANUS는 단일 위계 기관이라기보다 여러 외부 기구에서 차출된 인력을 임무 단위로 묶는 현장 집행 풀이다. 정규 분류는 SECTOR_A부터 SECTOR_E까지의 NATO phonetic 섹터를 따른다.

## S1E1 혼성팀
S1E1에서 마리아는 스타크, 빅보이, 키아나, 시유 등을 한 팀으로 묶어 운용한다. 이 구분은 노부스 오르도의 전체 인사 분류라기보다, 해당 작전에서 드러난 임시 혼성팀의 성격으로 읽는 편이 안전하다.

## 관련 문서
MANUS, 작전기록 S1E1: 질서

## 출처
노부스 오르도 기관 스펙 「MANUS」.
${source("p.35-p.36")}`,
  },
];

function validateDrafts() {
  const validCategories = new Set(["인물", "세력", "기관", "장소", "개체", "개념", "규정", "장비", "소모품", "문헌", "작전기록"]);
  const forbidden = [/NOSB 1\.pdf/i, /C:\\Users/i, /Downloads/i, /캐논/i, /confirmed/i, /candidate/i, /rumor/i, /rejected/i, /Codex Lore Import/i];
  const errors = [];
  for (const page of KEPT_PAGES) {
    if (!validCategories.has(page.category)) errors.push(`${page.slug}: invalid category`);
    if (!page.content.startsWith(`# ${page.title}\n\n`)) errors.push(`${page.slug}: missing h1/lead`);
    if (!page.content.includes("## 요약 정보")) errors.push(`${page.slug}: missing 요약 정보`);
    if (!page.content.includes("## 출처")) errors.push(`${page.slug}: missing 출처`);
    if (page.tags.length < 3 || page.tags.length > 6) errors.push(`${page.slug}: tag count`);
    for (const pattern of forbidden) {
      if (pattern.test(page.title) || pattern.test(page.content) || page.tags.some((tag) => pattern.test(tag))) {
        errors.push(`${page.slug}: forbidden ${pattern}`);
      }
    }
  }
  return errors;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const verify = process.argv.includes("--verify");
  const errors = validateDrafts();
  if (errors.length) {
    console.error("[s1e1-consolidate] validation failed");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  loadEnv();
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  try {
    const db = client.db(process.env.DB_NAME ?? "stargate");
    const col = db.collection("wiki_pages");
    const keepSlugs = KEPT_PAGES.map((page) => page.slug);
    const existing = await col.find({ slug: { $in: [...keepSlugs, ...DELETE_SLUGS] } }).project({ slug: 1 }).toArray();
    const existingSlugs = new Set(existing.map((doc) => doc.slug));
    const missingKeep = keepSlugs.filter((slug) => !existingSlugs.has(slug));
    if (missingKeep.length) throw new Error(`Missing kept pages: ${missingKeep.join(", ")}`);

    if (verify) {
      const docs = await col.find({ slug: { $in: [...keepSlugs, ...DELETE_SLUGS] } }).project({ _id: 0, slug: 1, title: 1, category: 1, tags: 1, content: 1, isPublic: 1, authorName: 1, createdAt: 1 }).toArray();
      const issues = [];
      for (const page of KEPT_PAGES) {
        const doc = docs.find((item) => item.slug === page.slug);
        if (!doc) {
          issues.push(`${page.slug}: missing`);
          continue;
        }
        if (doc.title !== page.title) issues.push(`${page.slug}: title mismatch`);
        if (doc.content !== page.content) issues.push(`${page.slug}: content mismatch`);
        if (doc.category !== page.category) issues.push(`${page.slug}: category mismatch`);
        if (JSON.stringify(doc.tags ?? []) !== JSON.stringify(page.tags)) issues.push(`${page.slug}: tags mismatch`);
        if (doc.isPublic !== true) issues.push(`${page.slug}: not public`);
        if (doc.authorName !== AUTHOR_NAME) issues.push(`${page.slug}: author mismatch`);
        if (new Date(doc.createdAt).toISOString() !== SESSION_CREATED_AT.toISOString()) issues.push(`${page.slug}: createdAt mismatch`);
      }
      for (const slug of DELETE_SLUGS) {
        if (docs.some((doc) => doc.slug === slug)) issues.push(`${slug}: should be deleted`);
      }
      const allS1 = await col.find({ tags: "S1E1" }).project({ _id: 0, slug: 1, title: 1, category: 1 }).sort({ category: 1, slug: 1 }).toArray();
      console.log(JSON.stringify({ kept: keepSlugs, deleted: DELETE_SLUGS, remainingS1E1: allS1, issues }, null, 2));
      return;
    }

    if (!execute) {
      console.log("[s1e1-consolidate] DRY RUN");
      console.log(JSON.stringify({ keep: keepSlugs, delete: DELETE_SLUGS.filter((slug) => existingSlugs.has(slug)) }, null, 2));
      return;
    }

    const now = new Date();
    const updates = [];
    for (const page of KEPT_PAGES) {
      const result = await col.updateOne(
        { slug: page.slug },
        {
          $set: {
            title: page.title,
            content: page.content,
            category: page.category,
            tags: page.tags,
            isPublic: true,
            authorId: AUTHOR_ID,
            authorName: AUTHOR_NAME,
            createdAt: SESSION_CREATED_AT,
            updatedAt: now,
          },
        },
      );
      updates.push({ slug: page.slug, matched: result.matchedCount, modified: result.modifiedCount });
    }
    const deleteResult = await col.deleteMany({ slug: { $in: DELETE_SLUGS } });
    console.log(JSON.stringify({ updates, deletedCount: deleteResult.deletedCount }, null, 2));
  } finally {
    await client.close();
  }
}

await main();
