export type IncidentSeverity = 'sev1' | 'sev2' | 'sev3' | 'sev4';
export type IncidentStatus = 'declared' | 'investigating' | 'mitigated' | 'monitoring' | 'resolved' | 'postmortem_complete';

export interface PlatformIncident {
  id:string;reference:string;title:string;summary:string;affectedService:string;severity:IncidentSeverity;status:IncidentStatus;
  customerImpact:string|null;rpoMinutes:number;rtoMinutes:number;declaredAt:string;updatedAt:string;postmortemDueAt:string|null;
}
export interface RestoreExercise {
  id:string;exerciseType:string;environment:string;status:string;backupPointAt:string;startedAt:string;completedAt:string;
  achievedRpoMinutes:number;achievedRtoMinutes:number;evidenceReference:string;findings:string;
}
export interface BackupRun {
  id:string;runReference:string;backupKind:string;triggerSource:string;status:string;backupPointAt:string;startedAt:string;
  completedAt:string|null;objectCount:number|null;byteCount:number|null;manifestSha256:string|null;offsiteReference:string|null;
  workflowRunUrl:string|null;failureSummary:string|null;
}
export interface RecoveryReadiness {
  databaseMethod:string;storageMethod:string;targetRpoMinutes:number;targetRtoMinutes:number;pitrStatus:string;schedule:string;
  lastSuccessAt:string|null;lastVerifiedRestoreAt:string|null;backupOverdue:boolean;
}

async function getSupabase(){return(await import('../../lib/supabaseClient')).supabase}
export async function fetchIncidents(status:IncidentStatus|null=null){
  const supabase=await getSupabase();const{data,error}=await supabase.rpc('admin_list_incidents',{p_status:status,p_limit:100});if(error)throw error;
  return(data??[]).map((r:any)=>({id:r.id,reference:r.reference,title:r.title,summary:r.summary,affectedService:r.affected_service,
    severity:r.severity,status:r.status,customerImpact:r.customer_impact,rpoMinutes:r.recovery_point_target_minutes,
    rtoMinutes:r.recovery_time_target_minutes,declaredAt:r.declared_at,updatedAt:r.updated_at,postmortemDueAt:r.postmortem_due_at}))as PlatformIncident[];
}
export async function declareIncident(input:{title:string;summary:string;affectedService:string;severity:IncidentSeverity;customerImpact:string;rpoMinutes:number;rtoMinutes:number}){
  const supabase=await getSupabase();const{data,error}=await supabase.rpc('admin_declare_incident',{p_title:input.title,p_summary:input.summary,
    p_affected_service:input.affectedService,p_severity:input.severity,p_customer_impact:input.customerImpact||null,
    p_rpo_minutes:input.rpoMinutes,p_rto_minutes:input.rtoMinutes});if(error)throw error;return String(data);
}
export async function transitionIncident(id:string,status:IncidentStatus,note:string){
  const supabase=await getSupabase();const{error}=await supabase.rpc('admin_transition_incident',{p_incident_id:id,p_status:status,p_note:note});if(error)throw error;
}
export async function fetchRestoreExercises(){
  const supabase=await getSupabase();const{data,error}=await supabase.rpc('admin_list_restore_exercises',{p_limit:50});if(error)throw error;
  return(data??[]).map((r:any)=>({id:r.id,exerciseType:r.exercise_type,environment:r.environment,status:r.status,
    backupPointAt:r.backup_point_at,startedAt:r.started_at,completedAt:r.completed_at,achievedRpoMinutes:r.achieved_rpo_minutes,
    achievedRtoMinutes:r.achieved_rto_minutes,evidenceReference:r.evidence_reference,findings:r.findings}))as RestoreExercise[];
}
export async function fetchBackupRuns(){
  const supabase=await getSupabase();const{data,error}=await supabase.rpc('admin_list_backup_runs',{p_limit:50});if(error)throw error;
  return(data??[]).map((r:any)=>({id:r.id,runReference:r.run_reference,backupKind:r.backup_kind,triggerSource:r.trigger_source,status:r.status,
    backupPointAt:r.backup_point_at,startedAt:r.started_at,completedAt:r.completed_at,objectCount:r.object_count==null?null:Number(r.object_count),
    byteCount:r.byte_count==null?null:Number(r.byte_count),manifestSha256:r.manifest_sha256,offsiteReference:r.offsite_reference,
    workflowRunUrl:r.workflow_run_url,failureSummary:r.failure_summary}))as BackupRun[];
}
export async function fetchRecoveryReadiness(){
  const supabase=await getSupabase();const{data,error}=await supabase.rpc('admin_get_recovery_readiness');if(error)throw error;const r=data?.[0];
  if(!r)throw new Error('Recovery readiness is not configured.');
  return{databaseMethod:r.database_method,storageMethod:r.storage_method,targetRpoMinutes:r.target_rpo_minutes,targetRtoMinutes:r.target_rto_minutes,
    pitrStatus:r.pitr_status,schedule:r.schedule,lastSuccessAt:r.last_success_at,lastVerifiedRestoreAt:r.last_verified_restore_at,
    backupOverdue:Boolean(r.backup_overdue)}as RecoveryReadiness;
}
export async function recordRestoreExercise(input:{exerciseType:string;environment:string;status:string;backupPointAt:string;startedAt:string;completedAt:string;achievedRpoMinutes:number;achievedRtoMinutes:number;evidenceReference:string;findings:string}){
  const supabase=await getSupabase();const{error}=await supabase.rpc('admin_record_restore_exercise',{p_exercise_type:input.exerciseType,
    p_environment:input.environment,p_status:input.status,p_backup_point_at:input.backupPointAt,p_started_at:input.startedAt,
    p_completed_at:input.completedAt,p_achieved_rpo_minutes:input.achievedRpoMinutes,p_achieved_rto_minutes:input.achievedRtoMinutes,
    p_evidence_reference:input.evidenceReference,p_findings:input.findings});if(error)throw error;
}
