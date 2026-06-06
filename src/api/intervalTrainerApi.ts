import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { isAuthenticated } from './authUtils';

const client = generateClient<Schema>();

export interface IntervalTrainerScorePayload {
  score: number;
  wrongAnswers: number;
  totalQuestions: number;
  elapsedSeconds: number;
  gameMode: string;
  stringCount: number;
  tuning: string;
  intervalsJson: string;
}

export async function saveScore(payload: IntervalTrainerScorePayload): Promise<boolean> {
  if (!(await isAuthenticated())) return false;
  try {
    const { data } = await client.models.IntervalTrainerScore.create({
      ...payload,
      completedAt: new Date().toISOString(),
    });
    return data != null;
  } catch {
    return false;
  }
}
