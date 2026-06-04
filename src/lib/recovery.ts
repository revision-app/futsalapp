import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

function normalizeAnswer(answer: string) {
  return answer.normalize("NFKC").trim().toLowerCase();
}

export function createRecoveryAnswerHash(answer: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(normalizeAnswer(answer), salt, 64).toString("hex");

  return { salt, hash };
}

export function verifyRecoveryAnswer(answer: string, salt: string, expectedHash: string) {
  const actualHash = scryptSync(normalizeAnswer(answer), salt, 64);
  const expected = Buffer.from(expectedHash, "hex");

  if (actualHash.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actualHash, expected);
}
