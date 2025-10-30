export interface RestorationStep {
  step: number;
  goal: string;
  prompt: string;
  beforeImage: string;
  afterImage: string;
}

export type AppStatus =
  | 'idle'
  | 'planning'
  | 'restoring'
  | 'done'
  | 'error';

export interface PlanStep {
  step: number;
  goal: string;
}
