export type ApplyFormInput = {
  name: string;
  email: string;
  motivation: string;
};

export type ContactFormInput = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertNonEmpty(value: string, fieldName: string) {
  if (!value.trim()) {
    throw new Error(`${fieldName}을(를) 입력해주세요.`);
  }
}

export function validateApplyForm(input: ApplyFormInput) {
  assertNonEmpty(input.name, "이름");
  assertNonEmpty(input.email, "이메일");
  assertNonEmpty(input.motivation, "지원 동기");

  if (!emailRegex.test(input.email)) {
    throw new Error("이메일 형식이 올바르지 않습니다.");
  }
}

export function validateContactForm(input: ContactFormInput) {
  assertNonEmpty(input.name, "이름");
  assertNonEmpty(input.email, "이메일");
  assertNonEmpty(input.subject, "제목");
  assertNonEmpty(input.message, "문의 내용");

  if (!emailRegex.test(input.email)) {
    throw new Error("이메일 형식이 올바르지 않습니다.");
  }
}
