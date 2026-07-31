export type OrganizationLifecycleStatus = 'active' | 'suspended' | 'recovery_pending' | 'closed';
export interface AdminOrganizationRecord {
  id:string;name:string;type:string;status:OrganizationLifecycleStatus;statusReason:string|null;
  memberCount:number;activePlan:string|null;recoveryRequestId:string|null;recoveryReason:string|null;
  createdAt:string;updatedAt:string;
}
async function getSupabase(){return(await import('../../lib/supabaseClient')).supabase}
export async function fetchAdminOrganizations(status:OrganizationLifecycleStatus|null,search:string){
  const supabase=await getSupabase();const{data,error}=await supabase.rpc('admin_list_organizations',{p_status:status,p_search:search||null,p_limit:100});
  if(error)throw error;return(data??[]).map((r:any)=>({id:r.id,name:r.name,type:r.type,status:r.status,statusReason:r.status_reason,
    memberCount:Number(r.member_count),activePlan:r.active_plan,recoveryRequestId:r.recovery_request_id,recoveryReason:r.recovery_reason,
    createdAt:r.created_at,updatedAt:r.updated_at}))as AdminOrganizationRecord[];
}
export async function transitionOrganization(id:string,action:'suspend'|'reactivate'|'close',reason:string){
  const {executeBackendCommand}=await import('../../lib/commandApi');await executeBackendCommand('organization.transition',{orgId:id,action,reason});
}
export async function decideOrganizationRecovery(id:string,approve:boolean,note:string){
  const {executeBackendCommand}=await import('../../lib/commandApi');await executeBackendCommand('organization.recovery.decide',{requestId:id,approve,note});
}
