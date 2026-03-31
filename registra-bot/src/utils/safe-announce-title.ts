/**
 * @here 공개 안내 본문에 삽입할 일정명(길이·마크다운·멘션 왜곡 완화)
 */
export function safeTitleForAnnouncePing(title: string): string {
  let t = title.trim();
  if (t.length > 180) t = `${t.slice(0, 177)}…`;
  return t
    .replace(/\\/g, "＼")
    .replace(/\*/g, "∗")
    .replace(/@/g, "@\u200b")
    .replace(/`/g, "＇");
}
