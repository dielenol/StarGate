import type { ApplyFormInput, ContactFormInput } from "@/lib/validators";

type SubmitResult = {
  ok: boolean;
  message: string;
};

async function postForm<T>(url: string, input: T): Promise<SubmitResult> {
  // 클라이언트 폼 데이터를 API Route로 전달합니다.
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  let data: SubmitResult | null = null;

  try {
    // 서버가 JSON 응답을 반환한 경우 메시지를 파싱합니다.
    data = (await response.json()) as SubmitResult;
  } catch {
    // 비정상 응답(빈 바디/JSON 아님)은 null로 처리합니다.
    data = null;
  }

  if (!response.ok) {
    // 서버가 보낸 상세 오류 메시지를 우선 노출합니다.
    throw new Error(data?.message ?? "요청 처리 중 오류가 발생했습니다.");
  }

  if (!data) {
    throw new Error("서버 응답을 처리하지 못했습니다.");
  }

  return data;
}

export async function submitApplyForm(input: ApplyFormInput) {
  return postForm("/api/apply", input);
}

export async function submitContactForm(input: ContactFormInput) {
  return postForm("/api/contact", input);
}
