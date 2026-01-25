// lib/tenant.ts
export async function getTenantIdForUser(supabase: any) {
  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('tenant_id')
    .limit(1)
    .single();

  if (error || !data?.tenant_id) {
    throw new Error('No tenant membership found for user');
  }
  return data.tenant_id as string;
}
