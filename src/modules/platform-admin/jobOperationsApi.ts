import { supabase } from '../../lib/supabaseClient';

export type BackgroundJobStatus = 'queued' | 'processing' | 'completed' | 'dead_letter';

export interface BackgroundJobSummary {
  queued: number;
  processing: number;
  completed: number;
  deadLetter: number;
  oldestQueuedAt: string | null;
  lastFailureAt: string | null;
}

export interface BackgroundJobRecord {
  id: string;
  jobType: string;
  status: BackgroundJobStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  lockedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchBackgroundJobSummary(): Promise<BackgroundJobSummary> {
  const { data, error } = await supabase.rpc('get_background_job_summary');
  if (error) throw error;
  return {
    queued: Number(data?.queued ?? 0),
    processing: Number(data?.processing ?? 0),
    completed: Number(data?.completed ?? 0),
    deadLetter: Number(data?.dead_letter ?? 0),
    oldestQueuedAt: data?.oldest_queued_at ?? null,
    lastFailureAt: data?.last_failure_at ?? null,
  };
}

export async function fetchBackgroundJobs(status: BackgroundJobStatus | null): Promise<BackgroundJobRecord[]> {
  const { data, error } = await supabase.rpc('admin_list_background_jobs', {
    p_status: status,
    p_limit: 100,
  });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    jobType: row.job_type,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    availableAt: row.available_at,
    lockedAt: row.locked_at,
    completedAt: row.completed_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function replayBackgroundJob(jobId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('admin_replay_background_job', { p_job_id: jobId });
  if (error) throw error;
  return data === true;
}
