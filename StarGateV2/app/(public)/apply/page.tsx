import RecruitmentClosedPanel from "../_components/recruitment-closed/RecruitmentClosedPanel";

import { PUBLIC_INTAKE_CONFIG } from "@/lib/public-intake";

import frameStyles from "../page.module.css";

export default function ApplyPage() {
  const intake = PUBLIC_INTAKE_CONFIG.apply;

  return (
    <main className={frameStyles["stargate-page"]}>
      <div className={frameStyles.stargate}>
        <div className={frameStyles.stargate__frame}>
          <RecruitmentClosedPanel
            eyebrow="ARCHIVE · 03 / ENTRY REVIEW"
            title="입회 심사 신청"
            dossierRows={[
              { k: "DOSSIER", v: "#03 · ENTRY-REVIEW" },
              { k: "STATUS", v: "SEALED · 기록 동결", status: true },
              { k: "SEALED AT", v: intake.sealedAtLabel },
              { k: "AUTHORITY", v: "OPS · COMMAND" },
            ]}
            dossierNote={
              <>
                본 기록지는 더 이상 신규 신청을 수락하지 않습니다.
                <br />
                제출된 심사 기록은 해당 부서에서 내부 열람만 가능합니다.
              </>
            }
            fields={[
              { label: "이름", placeholder: "신원 식별명을 입력하세요." },
              {
                label: "이메일",
                placeholder: "회신 가능한 채널(example@email.com)을 입력하세요.",
              },
              {
                label: "소개 기록",
                placeholder:
                  "활동 가능 시간, 성향, 참여 목적 등을 자유롭게 기록하세요.  (미작성도 무관합니다.)",
                tall: true,
              },
            ]}
            submitLabel="심사 기록 제출"
          />
        </div>
      </div>
    </main>
  );
}
