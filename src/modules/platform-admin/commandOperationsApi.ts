export interface CommandOperationsReport {
  windowDays: number;
  summary: { total: number; succeeded: number; failed: number; processing: number; retries: number };
  commands: Array<{ commandName: string; total: number; succeeded: number; failed: number }>;
  recent: Array<{ id: string; commandName: string; status: 'processing'|'succeeded'|'failed'; attemptCount: number; errorCode: string|null; requestId: string|null; startedAt: string }>;
}

export async function fetchCommandOperations(days: number): Promise<CommandOperationsReport> {
  const supabase = (await import('../../lib/supabaseClient')).supabase;
  const { data, error } = await supabase.rpc('admin_get_backend_command_summary', { p_days: days });
  if (error) throw new Error(error.message);
  return data as CommandOperationsReport;
}
