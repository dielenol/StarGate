import { NextResponse } from "next/server";
import { notifyApplySubmission } from "@/lib/discord";
import { validateApplyForm, type ApplyFormInput } from "@/lib/validators";

const BAD_REQUEST_MESSAGE = "기록 양식이 올바르지 않습니다.";
const SERVER_ERROR_MESSAGE = "심사 기록 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";

export async function POST(request: Request) {
  let payload: ApplyFormInput;

  try {
    // JSON 파싱 실패는 잘못된 요청 형식으로 간주합니다.
    payload = (await request.json()) as ApplyFormInput;
  } catch {
    return NextResponse.json({ ok: false, message: BAD_REQUEST_MESSAGE }, { status: 400 });
  }

  try {
    // 클라이언트 검증과 별개로 서버에서도 동일 검증을 수행합니다.
    validateApplyForm(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : BAD_REQUEST_MESSAGE;
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }

  try {
    // 검증 통과 후 Discord 채널로 접수 메시지를 전송합니다.
    await notifyApplySubmission(payload);
    return NextResponse.json({
      ok: true,
      message: "입회 심사 기록이 정상 접수되었습니다. 담당 검토관 확인 후 등록된 채널로 회신됩니다.",
    });
  } catch (error) {
    console.error("[apply] discord webhook error", error);
    return NextResponse.json({ ok: false, message: SERVER_ERROR_MESSAGE }, { status: 500 });
  }
}
