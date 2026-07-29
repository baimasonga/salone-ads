import { supabase } from './supabaseClient';
export interface FinanceInvoice { id:string; number:string; orgName:string; sourceType:string; currency:string; total:number; paid:number; status:string; dueAt:string|null }
export async function fetchFinanceInvoices():Promise<FinanceInvoice[]>{
 const {data,error}=await supabase.from('commercial_invoices').select('id,invoice_number,source_type,currency_code,total_amount,amount_paid,status,due_at,organizations(name)').order('issued_at',{ascending:false});
 if(error)throw error; return(data??[]).map((r:any)=>({id:r.id,number:r.invoice_number,orgName:r.organizations?.name??'Unknown',sourceType:r.source_type,currency:r.currency_code,total:Number(r.total_amount),paid:Number(r.amount_paid),status:r.status,dueAt:r.due_at}));
}
export async function recordFinancePayment(invoiceId:string,reference:string,method:string,amount:number){const{error}=await supabase.rpc('record_commercial_payment',{p_invoice_id:invoiceId,p_reference:reference,p_method:method,p_amount:amount});if(error)throw error;}

