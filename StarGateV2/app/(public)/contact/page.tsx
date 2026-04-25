import RecruitmentClosedPanel from "../_components/recruitment-closed/RecruitmentClosedPanel";

import frameStyles from "../page.module.css";

export default function ContactPage() {
  return (
    <main className={frameStyles["stargate-page"]}>
      <div className={frameStyles.stargate}>
        <div className={frameStyles.stargate__frame}>
          <RecruitmentClosedPanel
            eyebrow="ARCHIVE · 04 / CLASSIFIED INQUIRY"
            title="기밀 문의 접수"
            dossierRows={[
              { k: "DOSSIER", v: "#04 · CLASSIFIED-INQUIRY" },
              { k: "STATUS", v: "SEALED · 창구 폐쇄", status: true },
              { k: "SEALED AT", v: "2026 · 04 · 24 · 23:59 KST" },
              { k: "AUTHORITY", v: "OPS · COMMAND" },
            ]}
            dossierNote={
              <>
                본 창구는 신규 문의를 더 이상 수락하지 않습니다.
                <br />
                기존 티켓의 회신은 내부 채널에서 순차적으로 처리됩니다.
              </>
            }
            fields={[
              { label: "이름", placeholder: "신원 식별명을 입력하세요." },
              {
                label: "이메일",
                placeholder: "회신 가능한 채널(example@email.com)을 입력하세요.",
              },
              { label: "제목", placeholder: "문의 분류용 제목을 입력하세요." },
              {
                label: "문의 내용",
                placeholder: "문의 상세 내용을 기록하세요.",
                tall: true,
              },
            ]}
            submitLabel="기밀 문의 제출"
          />
        </div>
      </div>
    </main>
  );
}
