import { ObjectId } from "mongodb";

/** ObjectId 형식(24자리 hex) 여부 검사 */
export function isValidObjectId(id: string): boolean {
  return ObjectId.isValid(id) && new ObjectId(id).toString() === id;
}
