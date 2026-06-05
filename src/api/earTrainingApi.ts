import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { isAuthenticated } from './authUtils';

const client = generateClient<Schema>();

export interface EarTrainingScorePayload {
  exerciseType: string;
  score: number;
  wrongAnswers: number;
  totalQuestions: number;
  elapsedSeconds: number;
  gameMode: string;
  difficulty: string;
  completedAt: string;
}

export async function saveScore(payload: EarTrainingScorePayload): Promise<boolean> {
  if (!(await isAuthenticated())) return false;
  try {
    const { data } = await client.models.EarTrainingScore.create({
      ...payload,
      completedAt: new Date().toISOString(),
    });
    return data != null;
  } catch {
    return false;
  }
}
