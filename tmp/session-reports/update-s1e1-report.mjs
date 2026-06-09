import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(`${process.cwd()}/package.json`);
const { MongoClient } = require("mongodb");

const SESSION_ID = "NOSB-S1E1-ORDER";
const RECORD_DATE = new Date("2026-03-15T15:00:00.000Z");

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

const summary = `# 작전기록 S1E1: 질서

노부스 오르도 현장팀은 한반도 남부에서 감지된 줄루 개체 ZULU-0028, 통칭 검열된 비명을 추적하고 격리했다. 본 보고서는 신규 행정직 스타크 일로니손의 블랙 피라미드 합류부터 한국 작전지 투입, 외부 세력과의 충돌, 주민 대피, 라디오 타워 교전, 백색소음 격리, 최종 기록 말소까지의 전 과정을 요약한다.

![검열된 비명 - ZULU-0028](/assets/wiki/entities/zulu-0028.webp "ZULU-0028 격리 개체 아카이브 도판")

## 작전 개요
작전은 미국 맨해튼 블랙 피라미드에서 시작된다. 스타크 일로니손은 노부스 오르도 사무국에 합류하고, 동시에 키아나와 시유는 마리아의 감독 아래 모의 전투 평가를 받는다. 이후 수잔 델라웨어와 Mr. 오드는 한반도 남부에서 감지된 줄루 위협을 보고하며 현장팀을 파견한다.

세계이사회가 제시한 목표는 지역 패닉을 2단계 이하로 유지하고, 줄루 히스토리를 말소하며, 가능하면 개체를 생포하는 것이다. 이 목표는 이후 한국 군부의 파괴·은폐 요구, 화이트로즈의 피해 공개 요구, 노부스 오르도 내부의 기록 통제 판단과 계속 충돌한다.

## 시간대별 노드
01. 블랙 피라미드 입소: 스타크 일로니손이 사무국에 도착하고, 주요 사무국 인물 및 현장 인력과 접촉한다.
02. 모의 전투 평가: 키아나와 시유가 전투 평가에서 부적격 판정을 받고, 마리아는 실험적 혼성팀 운용을 시사한다.
03. 작전 브리핑: 천리안 감지망이 한반도 남부 줄루 위협을 포착했다는 보고가 공유된다.
04. 한국 투입: 현장팀은 고층 이륙 시설을 통해 작전지로 이동하고, 한국 정보기관 요원과 접촉한다.
05. 요구 충돌: 한국 군부는 개체 파괴 또는 인도, 목격자 및 피해자 사살 후 은폐를 요구한다.
06. 화이트로즈 접촉: 하얀 장미 뱃지를 단 기자가 주민 피해와 과거 군부 위장 시설, USB 및 비밀 보고서를 제시한다.
07. 은폐 발표: 스타크는 전자기 폭풍 커버스토리로 기자회견을 진행해 주민 대피를 유도한다.
08. 라디오 타워 진입: 드론 정찰로 산악 라디오 시설과 미군 관할 표식, 거대한 형체가 확인된다.
09. 줄루 교전: 검열된 비명은 고주파, 금지어, 자음, 깨진 음절, 소음 증폭을 이용해 현장팀을 압박한다.
10. 격리 도출: 오틸리아의 분석과 GP03-RX780의 백색소음 프로토콜을 바탕으로 귀와 청각 기능 무력화, 백색소음 격리 조건이 확립된다.
11. 기록 말소: 화이트로즈 기자의 USB와 문서는 마리아의 판단으로 말소된다.

## ZULU-0028 검열된 비명
검열된 비명은 검은 노이즈로 뒤덮인 인간형 형체로 기록된다. 윤곽선은 수신 불량 화면처럼 흔들리며, 소리를 지를 때 주변의 문자와 화면 속 글씨가 깨지고 뒤섞이는 현상이 동반된다.

개체는 높은 고주파 공격을 가하고, 일대에 난치성 정신병을 유발할 수 있는 것으로 보고된다. 소리와 음절에 민감하게 반응하며, 가장 큰 소리가 나는 곳에 집중한다. 소음이 커질수록 피해가 강화되는 양상이 관찰되었다.

격리 조건은 청각 기능의 무력화와 백색소음 환경 유지다. 최종적으로 현장팀은 개체의 귀와 청각 기능을 파괴하고, GP03-RX780의 백색소음 프로토콜과 임시 상자 격리를 통해 개체를 생포했다. 격리 개체 아카이브 기준 등록 번호는 ZULU-0028이며, 격리 위치는 지하 방음시설, 격리율은 50%로 기록된다.

## 외부 세력과 정보 통제
한국 정보기관 요원은 군부의 요구를 전달했으나, 노부스 오르도 현장팀은 목격자 및 피해자 사살 요구를 수용하지 않았다. 화이트로즈 기자는 주민 피해와 과거 실험 시설의 존재를 언급하며 피해 보상, 치료, 자료 공개를 요구했다.

이 대립은 작전의 핵심 쟁점이 된다. 노부스 오르도는 주민 대피와 개체 격리를 성공시켰지만, 최종적으로 USB와 비밀 보고서를 말소했다. 해쉬 테거는 기관이 사람을 위한 조직이어야 한다고 주장했고, 마리아는 줄루라는 전략적 변수를 위한 기관이라는 관점을 드러냈다.

## 결과
주민 대피는 성공했고 사상자는 0명으로 정리 가능한 흐름을 확보했다. 지역 패닉은 세계이사회가 요구한 2단계보다 낮은 1단계까지 억제된 것으로 기록된다. 검열된 비명은 임시 격리되었고, 본부에는 특수 제작 격리상자 주문이 보고되었다.

작전은 전술적으로 성공했지만, 기록 말소와 시민사회 대응 방식에 대한 내부 윤리 쟁점을 남겼다. 후속 세션에서 화이트로즈, 한국 군부, 세계이사회, 노부스 오르도 내부 목적론이 다시 충돌할 가능성이 있다.

## 관련 위키
검열된 비명, 줄루, 지역 패닉, MANUS 현장 분류, 화이트로즈, 블랙 피라미드`;

const highlights = [
  "블랙 피라미드에서 스타크 일로니손이 클라운으로 사무국에 합류하고, 주요 현장 인력과 처음 접촉했다.",
  "키아나와 시유는 마리아의 모의 전투 평가에서 부적격 판정을 받았고, 실험적 혼성팀 운용의 배경이 마련되었다.",
  "세계이사회와 Mr. 오드는 한반도 남부 줄루 위협에 대해 지역 패닉 2단계 이하 유지, 줄루 히스토리 말소, 가능 시 생포를 지시했다.",
  "한국 정보기관 요원은 군부의 요구로 개체 파괴 또는 인도, 목격자 및 피해자 사살 후 은폐를 전달했으나 현장팀은 이를 수용하지 않았다.",
  "화이트로즈 기자는 주민 피해, 과거 위장 시설, USB 및 비밀 보고서를 제시하며 피해 공개와 보상을 요구했다.",
  "스타크 일로니손은 전자기 폭풍 커버스토리로 기자회견을 진행했고, 주민 대피를 성공시켜 지역 패닉을 1단계까지 낮췄다.",
  "드론 정찰로 산악 라디오 타워와 미군 관할 표식, 거대한 줄루 형체가 확인되었다.",
  "검열된 비명은 고주파, 금지어, 자음, 깨진 음절, 소음 증폭을 이용해 현장팀을 공격했다.",
  "오틸리아의 분석으로 개체가 청각 자극에 의존하며 증폭될수록 불안정해진다는 격리 단서가 도출되었다.",
  "GP03-RX780의 백색소음 프로토콜과 임시 상자 격리를 통해 ZULU-0028 검열된 비명이 생포되었다.",
  "USB와 비밀 보고서는 마리아의 판단으로 말소되었고, 해쉬 테거와 마리아 사이에 기관의 목적을 둘러싼 갈등이 남았다.",
];

const participants = [
  "CLOWN",
  "BIG BOY",
  "INDEXER",
  "MARGARET",
  "WD",
  "MARIA",
  "GP03-RX780",
  "LEE DONGSIK",
  "UNYEON",
  "TIGER298",
  "OTILIA",
];

async function main() {
  const execute = process.argv.includes("--execute");
  loadEnv();

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  try {
    const col = client.db(process.env.DB_NAME ?? "stargate").collection("session_reports");
    const report = await col.findOne({ sessionId: SESSION_ID }, { projection: { _id: 1, sessionTitle: 1 } });
    if (!report) throw new Error(`Missing report: ${SESSION_ID}`);

    if (!execute) {
      console.log(
        JSON.stringify(
          {
            id: String(report._id),
            sessionId: SESSION_ID,
            summaryLength: summary.length,
            highlights: highlights.length,
            participants: participants.length,
          },
          null,
          2,
        ),
      );
      return;
    }

    const result = await col.updateOne(
      { sessionId: SESSION_ID },
      {
        $set: {
          sessionTitle: "작전기록 S1E1: 질서",
          summary,
          highlights,
          participants,
          gmId: "novus-ordo-record-control",
          gmName: "NOVUS ORDO 사무국 기록통제실 연구원 N. Voss",
          createdAt: RECORD_DATE,
          updatedAt: RECORD_DATE,
        },
      },
    );
    console.log(JSON.stringify({ matched: result.matchedCount, modified: result.modifiedCount }, null, 2));
  } finally {
    await client.close();
  }
}

await main();
