export interface PersistedGalleryUpload<T> {
  created: boolean;
  document: T;
}

/**
 * Blob이 먼저 생성되는 업로드의 보상 경계를 DB persist 단계로 한정한다.
 * 이 함수가 성공한 뒤의 응답 생성/직렬화 실패는 정상 Blob을 삭제하면 안 된다.
 */
export async function persistUploadedGalleryFanart<T>(input: {
  compensate: () => Promise<void>;
  persist: () => Promise<PersistedGalleryUpload<T>>;
}): Promise<PersistedGalleryUpload<T>> {
  let result: PersistedGalleryUpload<T>;
  try {
    result = await input.persist();
  } catch (error) {
    await input.compensate();
    throw error;
  }

  if (!result.created) await input.compensate();
  return result;
}
