import type { ApplyFormInput, ContactFormInput } from "@/lib/validators";

export async function submitApplyForm(_input: ApplyFormInput) {
  void _input;
  await new Promise((resolve) => setTimeout(resolve, 700));

  return {
    ok: true,
    message:
      "지원서가 임시로 접수되었습니다. 추후 메일 전송 API 연동 시 실제 제출이 활성화됩니다.",
  };
}

export async function submitContactForm(_input: ContactFormInput) {
  void _input;
  await new Promise((resolve) => setTimeout(resolve, 700));

  return {
    ok: true,
    message:
      "문의가 임시로 접수되었습니다. 추후 메일 전송 API 연동 시 실제 제출이 활성화됩니다.",
  };
}
