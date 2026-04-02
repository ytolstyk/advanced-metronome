import { generateClient } from 'aws-amplify/data';
import { getCurrentUser } from 'aws-amplify/auth';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

async function isAuthenticated(): Promise<boolean> {
  try {
    await getCurrentUser();
    return true;
  } catch {
    return false;
  }
}

export interface FretMemorizerScorePayload {
  score: number;
  wrongAnswers: number;
  totalQuestions: number;
  elapsedSeconds: number;
  gameMode: string;
  stringCount: number;
  tuning: string;
}

export async function saveScore(payload: FretMemorizerScorePayload): Promise<boolean> {
  if (!(await isAuthenticated())) return false;
  try {
    const { data } = await client.models.FretMemorizerScore.create({
      ...payload,
      completedAt: new Date().toISOString(),
    });
    return data != null;
  } catch {
    return false;
  }
}
