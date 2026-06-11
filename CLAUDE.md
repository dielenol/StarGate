# StarGate Claude Wrapper

이 파일은 Claude Code용 얇은 래퍼다. 프로젝트 구조, 개발 명령어, 커밋 컨벤션의 단일 기준은 `AGENTS.md`를 따른다.

## 적용 규칙

- 프로젝트 정보와 작업 규칙은 먼저 `AGENTS.md`를 읽는다.
- 커밋 메시지 형식은 `.claude/rules/commit-convention.md`를 따른다.
- Claude 전역 하네스의 `/overseer`, agent, hook, eval 문서는 Claude Code에서만 실행 가능한 원본 정책으로 취급한다.
- Codex에서 작업할 때는 전역 Codex 지침이 Claude 하네스 문서보다 우선한다.
