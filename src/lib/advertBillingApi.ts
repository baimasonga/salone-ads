import { executeBackendCommand } from './commandApi';
import { supabase } from './supabaseClient';

export interface AdvertPackage {
  id: string;
  code: string;
  name: string;
  description: string;
  placement: string;
  prices: Array<{
    billingPeriod: 'daily' | 'weekly' | 'monthly';
    amount: number;
    currencyCode: string;
  }>;
}

export interface AdvertOrder {
  id: string;
  orderNumber: string;
  invoiceNumber: string;
  receiptNumber: string | null;
  orgId: string;
  campaignId: string | null;
  packageName: string;
  billingPeriod: string;
  quantity: number;
  totalAmount: number;
  currencyCode: string;
  paymentMethod: string;
  paymentReference: string | null;
  status: string;
  createdAt: string;
}

const ADVERT_ORDER_SELECT =
  'id, order_number, invoice_number, receipt_number, org_id, campaign_id, billing_period, quantity, total_amount, currency_code, payment_method, payment_reference, status, created_at, advert_packages(name)';

export function mapAdvertOrder(row: any): AdvertOrder {
  return {
    id: row.id,
    orderNumber: row.order_number,
    invoiceNumber: row.invoice_number,
    receiptNumber: row.receipt_number ?? null,
    orgId: row.org_id,
    campaignId: row.campaign_id ?? null,
    packageName: row.advert_packages?.name ?? 'Advert package',
    billingPeriod: row.billing_period,
    quantity: row.quantity,
    totalAmount: Number(row.total_amount),
    currencyCode: row.currency_code,
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference ?? null,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function fetchAdvertPackages(): Promise<AdvertPackage[]> {
  const { data, error } = await supabase
    .from('advert_packages')
    .select('id, code, name, description, placement, advert_package_prices(billing_period, amount, currency_code)')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    placement: row.placement,
    prices: (row.advert_package_prices ?? []).map((price: any) => ({
      billingPeriod: price.billing_period,
      amount: Number(price.amount),
      currencyCode: price.currency_code,
    })),
  }));
}

export async function fetchAdvertOrders(orgId: string, isPlatformAdmin: boolean): Promise<AdvertOrder[]> {
  let query = supabase.from('advert_orders').select(ADVERT_ORDER_SELECT);
  if (!isPlatformAdmin) query = query.eq('org_id', orgId);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapAdvertOrder);
}

export async function createAdvertOrder(input: {
  orgId: string;
  campaignId: string | null;
  packageId: string;
  billingPeriod: 'daily' | 'weekly' | 'monthly';
  quantity: number;
  amount: number;
  currencyCode: string;
  paymentMethod: string;
  paymentReference: string;
}): Promise<void> {
  await executeBackendCommand('advertising.order.create', input);
}

// Payment confirmation stays server-side so the order, invoice, receipt and
// append-only ledger entries are committed atomically.
export async function confirmAdvertOrder(orderId: string, paymentReference?: string): Promise<string> {
  const { data, error } = await supabase.rpc('confirm_advert_order', {
    p_order_id: orderId,
    p_payment_reference: paymentReference?.trim() || null,
  });
  if (error) throw error;
  return data as string;
}

export async function fetchAdvertOrdersForOrganizations(orgIds: string[]): Promise<AdvertOrder[]> {
  if (!orgIds.length) return [];
  const { data, error } = await supabase
    .from('advert_orders')
    .select(ADVERT_ORDER_SELECT)
    .in('org_id', orgIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapAdvertOrder);
}
