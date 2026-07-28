import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAmeriWorkshopDiscordDmContent,
  buildRegistrarTradeDiscordDmContent,
} from "../dist/domain/discord-dm-dialogue.js";

const AMERI_INPUT = {
  event: "QUOTED",
  kind: "upgrade",
  characterCodename: "LEE DONGSIK",
  equipmentName: "공격 방패 - 크레모아 개조형",
  totalCost: 2_200,
  durationMinutes: 4_320,
  specialistWorkflow: [
    { specialistCodename: "TEMPER", task: "본체 보강" },
    { specialistCodename: "TOWASKI", task: "폭발물 마무리" },
  ],
  workshopUrl: "https://www.ordonet.co.kr/erp/equipment-shop/custom",
};

test("아메리 공방 DM은 모든 절차에서 짧은 행정관 말투를 유지한다", () => {
  const expectations = [
    ["REQUESTED", /요청을 접수했어요.*검토 대기열/s],
    ["IN_REVIEW", /요청을 검토 중이에요.*결재선/s],
    ["QUOTED", /견적서를 정리했어요.*못 봤다는 말/s],
    ["IN_PROGRESS", /작업 문서를 넘겼어요.*재촉 문서/s],
    ["READY", /완료 보고가 도착했어요.*수령 확인도 절차예요/s],
    ["DECLINED", /견적 거절로 기록했어요.*변경점을 먼저 적어주세요/s],
    ["REJECTED", /요청이 반려됐어요.*하아\.\./s],
    ["CANCELLED", /작업을 취소 처리했어요.*반환 대장/s],
    ["COMPLETED", /수령 처리를 종결했어요.*커피가 완전히 식기 전/s],
  ];

  for (const [event, pattern] of expectations) {
    const content = buildAmeriWorkshopDiscordDmContent({
      ...AMERI_INPUT,
      event,
      note: "검토 사유",
    });
    assert.match(content, pattern);
    assert.match(content, /NOVUS ORDO · AMERI/);
    assert.ok(content.length < 2_000);
  }
});

test("아메리 견적 DM은 비용·시간·담당 순서를 빠짐없이 정리한다", () => {
  const content = buildAmeriWorkshopDiscordDmContent(AMERI_INPUT);

  assert.match(content, /2,200 CR/);
  assert.match(content, /72시간 · 3일/);
  assert.match(content, /담당 순서:/);
  assert.match(content, /브리짓 케인 \(TEMPER\) · 본체 보강/);
  assert.match(content, /립 토와스키 \(TOWASKI\) · 폭발물 마무리/);
});

test("아메리 재장전 완료는 수령 문구 대신 결재 종결 문구를 사용한다", () => {
  const content = buildAmeriWorkshopDiscordDmContent({
    ...AMERI_INPUT,
    event: "COMPLETED",
    kind: "reload",
  });

  assert.match(content, /재장전 결재를 종결했어요/);
  assert.match(content, /장비 액션 충전 상태까지 복구됐어요/);
  assert.doesNotMatch(content, /수령 처리를 종결했어요/);
});

const REGISTRAR_INPUT = {
  event: "EXCHANGE_OPENED",
  recipientCodename: "INDEXER",
  otherCharacterCodename: "LEE_DONGSIK",
  offer: {
    credits: 1_500,
    items: [{ itemName: "응급 키트", quantity: 2 }],
    stocks: [{ ticker: "NOSB", shares: 3 }],
  },
  tradeUrl: "https://www.ordonet.co.kr/erp/trades",
};

test("레지스트라 거래 DM은 모든 절차에서 대장·효력 중심 문체를 유지한다", () => {
  const expectations = [
    ["EXCHANGE_OPENED", /대장에 등재되었습니다.*자산 이동은 승인되지 않습니다/s],
    ["GIFT_RECEIVED", /대장에 확정되었습니다.*반영 내역을 기준으로 확인 바랍니다/s],
    ["EXCHANGE_COMPLETED", /최종 확정되었습니다.*별도 절차 없이는 허용되지 않습니다/s],
    ["EXCHANGE_CANCELLED", /취소·종결되었습니다.*효력을 상실.*종결 기록되었습니다/s],
  ];

  for (const [event, pattern] of expectations) {
    const content = buildRegistrarTradeDiscordDmContent({
      ...REGISTRAR_INPUT,
      event,
    });
    assert.match(content, pattern);
    assert.match(content, /NOVUS ORDO · REGISTRAR/);
    assert.ok(content.length < 2_000);
  }
});

test("레지스트라 교환 요청은 수신자·상대·제시 자산을 행정 문체로 통보한다", () => {
  const content = buildRegistrarTradeDiscordDmContent(REGISTRAR_INPUT);

  assert.match(content, /INDEXER님/);
  assert.match(content, /LEE\\_DONGSIK 측/);
  assert.match(content, /1,500 CR/);
  assert.match(content, /응급 키트 × 2/);
  assert.match(content, /NOSB 3주/);
  assert.match(content, /수락 또는 거절을 회신하십시오/);
});
