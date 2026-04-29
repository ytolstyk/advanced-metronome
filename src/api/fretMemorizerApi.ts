import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { isAuthenticated } from './authUtils';

const client = generateClient<Schema>();

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
