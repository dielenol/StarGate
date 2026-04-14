import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { findUserById, verifyPassword, updatePassword } from "@/lib/db/users";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { currentPassword?: string; newPassword?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "잘못된 요청 형식입니다." },
      { status: 400 },
    );
  }

  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "현재 비밀번호와 새 비밀번호를 모두 입력하세요." },
      { status: 400 },
    );
  }

  if (
    newPassword.length < MIN_PASSWORD_LENGTH ||
    newPassword.length > MAX_PASSWORD_LENGTH
  ) {
    return NextResponse.json(
      {
        error: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상 ${MAX_PASSWORD_LENGTH}자 이하여야 합니다.`,
      },
      { status: 400 },
    );
  }

  try {
    const user = await findUserById(session.user.id);

    if (!user) {
      return NextResponse.json(
        { error: "사용자를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const isValid = await verifyPassword(user, currentPassword);

    if (!isValid) {
      return NextResponse.json(
        { error: "현재 비밀번호가 일치하지 않습니다." },
        { status: 403 },
      );
    }

    await updatePassword(session.user.id, newPassword);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "비밀번호 변경에 실패했습니다." },
      { status: 500 },
    );
  }
}
