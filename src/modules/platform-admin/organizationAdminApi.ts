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
  const supabase=await getSupabase();const{error}=await supabase.rpc('admin_transition_organization',{p_org_id:id,p_action:action,p_reason:reason});if(error)throw error;
}
export async function decideOrganizationRecovery(id:string,approve:boolean,note:string){
  const supabase=await getSupabase();const{error}=await supabase.rpc('admin_decide_organization_recovery',{p_request_id:id,p_approve:approve,p_note:note});if(error)throw error;
}
