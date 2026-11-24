import { ObjectId } from "mongodb";

export function normalizeMemberKey(ids: string[]) {
  return [...new Set(ids)].sort().join(":");
}

export function conversationChannel(id: string) {
  return `conversation:${id}`;
}

export function isObjectId(value: string) {
  return ObjectId.isValid(value) && new ObjectId(value).toString() === value;
}
