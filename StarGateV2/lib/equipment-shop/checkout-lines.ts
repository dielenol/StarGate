/** 동일 master item을 slug와 ObjectId 별칭으로 중복 요청하는 우회를 감지한다. */
export function containsDuplicateEquipmentItemIds(
  itemIds: readonly string[],
): boolean {
  return new Set(itemIds).size !== itemIds.length;
}
