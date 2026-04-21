# schemas 테스트

`node:test` + 사전 빌드된 `dist/` 를 사용하는 가벼운 테스트. 새 devDep 없음.

## 실행

```bash
pnpm --filter @stargate/shared-db build   # dist 최신화 (테스트 전 필수)
node --test packages/shared-db/src/schemas/__tests__/*.test.mjs
```

## 범위

- `common.test.mjs` — primitive schema (codeSchema / slugSchema / isoDateStringSchema)
- `faction.schema.test.mjs` — FactionDoc/Frontmatter 검증
- `institution.schema.test.mjs` — InstitutionDoc/Frontmatter 검증
- `npc.schema.test.mjs` — NpcDoc/Frontmatter + toDbNpc 어댑터
- `frontmatter.test.mjs` — parseFrontmatter, parseMdBody 엣지 케이스 + 템플릿 round-trip
- `characters-allowlist.test.mjs` — updateCharacter 필드 화이트리스트
- `seed-payload.test.mjs` — `scripts/seed-factions.ts` / `seed-institutions.ts`의 `buildPayload` 결과가 `factionDocSchema` / `institutionDocSchema`를 통과하는지 sanity check. seed와 스키마 간 drift 감지.
- `migration.test.mjs` — 레거시 `docs/civil-society/*` / `docs/spec/npc/npc-*-spec.md`를 신 규격으로 이주한 `StarGateV2/docs/spec/npc/{registrar,dominique-lee,towaski}.md` 의 파싱·스키마 통과 round-trip 검증.

## 제약

- 테스트는 **dist 산출물**을 import. 소스 수정 후 `pnpm build` 필수.
- 실제 MongoDB 연결 없음. 스키마/어댑터 레벨 검증만.
