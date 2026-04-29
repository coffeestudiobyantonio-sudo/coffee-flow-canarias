import { supabase } from './supabase';
import type { Silo, MasterProfile, DailyRoastOrder } from '../App';

// =======================
// SILOS
// =======================
export const fetchSilos = async (): Promise<Silo[]> => {
  const { data, error } = await supabase.from('silos').select('*').order('id', { ascending: true });
  if (error) {
    console.error('Error fetching silos:', error);
    return [];
  }
  return data.map(s => ({
    id: s.id,
    profileName: s.origin,
    currentKg: Number(s.current_kg),
    maxKg: 472, // Hardcoded bump to 472kg (1890kg/4)
    lastFillDate: s.last_fill_date
  }));
};

export const updateSilo = async (id: number, updates: Partial<Silo>) => {
  const dbUpdates: any = {};
  if (updates.profileName !== undefined) dbUpdates.origin = updates.profileName;
  if (updates.currentKg !== undefined) dbUpdates.current_kg = updates.currentKg;
  if (updates.lastFillDate !== undefined) dbUpdates.last_fill_date = updates.lastFillDate;

  const { error } = await supabase.from('silos').update(dbUpdates).eq('id', id);
  if (error) console.error('Error updating silo:', error);
  return !error;
};

// =======================
// MASTER PROFILES
// =======================
export const fetchMasterProfiles = async (): Promise<MasterProfile[]> => {
  const { data, error } = await supabase.from('master_profiles').select('*');
  if (error) {
    console.error('Error fetching profiles:', error);
    return [];
  }
  return data.map(p => ({
    name: p.name,
    agtron: p.agtron,
    roastedType: p.roasted_type,
    businessUnit: p.business_unit as 'LIDL' | 'PROPIA',
    roastStrategy: p.roast_strategy as any,
    expectedShrinkage: p.expected_shrinkage,
    blend: p.blend || [],
    sensory: p.sensory || {fragrancia: 0, aroma: 0, sabor: 0, cuerpo: 0},
    machineProfiles: p.machine_profiles || {}
  }));
};

export const createMasterProfile = async (profile: MasterProfile) => {
  const { error } = await supabase.from('master_profiles').insert([{
    name: profile.name,
    agtron: profile.agtron,
    roasted_type: profile.roastedType,
    business_unit: profile.businessUnit,
    roast_strategy: profile.roastStrategy,
    expected_shrinkage: profile.expectedShrinkage,
    blend: profile.blend,
    sensory: profile.sensory,
    machine_profiles: profile.machineProfiles
  }]);
  if (error) console.error('Error pushing profile:', error);
  return !error;
};

export const updateMasterProfile = async (profileName: string, profile: MasterProfile) => {
  const { error } = await supabase.from('master_profiles').update({
    agtron: profile.agtron,
    roasted_type: profile.roastedType,
    business_unit: profile.businessUnit,
    roast_strategy: profile.roastStrategy,
    expected_shrinkage: profile.expectedShrinkage,
    blend: profile.blend,
    sensory: profile.sensory,
    machine_profiles: profile.machineProfiles
  }).eq('name', profileName);
  if (error) console.error('Error updating profile:', error);
  return !error;
};

export const deleteMasterProfile = async (profileName: string) => {
  const { error } = await supabase.from('master_profiles').delete().eq('name', profileName);
  if (error) console.error('Error deleting profile:', error);
  return !error;
};

// =======================
// DAILY ROAST ORDERS
// =======================
export const fetchDailyOrders = async (): Promise<DailyRoastOrder[]> => {
  const { data: dbOrders, error: ordersError } = await supabase.from('daily_roast_orders').select('*').order('created_at', { ascending: false });
  if (ordersError) {
    console.error('Error fetching orders:', ordersError);
    return [];
  }

  const { data: dbTasks, error: tasksError } = await supabase.from('roast_tasks').select('*').order('id', { ascending: true });
  if (tasksError) {
    console.error('Error fetching tasks:', tasksError);
    return [];
  }

  // Aggregate tasks into orders
  return dbOrders.map(o => {
    const orderTasks = dbTasks
      .filter(t => t.parent_order_id === o.id)
      .map(t => ({
        id: t.id,
        parentOrderId: t.parent_order_id,
        type: t.type as any,
        masterProfile: t.master_profile as any,
        machineId: t.machine_id,
        origins: t.origins || [],
        targetWeightKg: Number(t.target_weight_kg),
        actualWeightKg: t.actual_weight_kg ? Number(t.actual_weight_kg) : undefined,
        status: t.status as any,
        consumedLots: t.consumed_lots || [],
        assignedSilos: t.assigned_silos || [],
        batchIndex: t.batch_index,
        totalBatches: t.total_batches,
        parentOrderTotalKg: t.parent_order_total_kg ? Number(t.parent_order_total_kg) : undefined,
        category: t.category as any,
        roastedAt: t.roasted_at,
        roastData: t.roast_data,
        fulfilledDemandIds: t.fulfilled_demand_ids || []
      }));

    return {
      id: o.id,
      profileName: o.profile_name,
      totalKg: Number(o.total_kg),
      priority: o.priority as any,
      shrinkagePct: Number(o.shrinkage_pct),
      status: o.status as any,
      estimatedPmpCost: o.estimated_pmp_cost ? Number(o.estimated_pmp_cost) : undefined,
      category: o.category as any,
      tasks: orderTasks
    };
  });
};

export const createDailyOrder = async (order: DailyRoastOrder) => {
  // Insert Order
  const { error: oError } = await supabase.from('daily_roast_orders').insert([{
    id: order.id,
    profile_name: order.profileName,
    total_kg: order.totalKg,
    priority: order.priority,
    shrinkage_pct: order.shrinkagePct,
    status: order.status,
    estimated_pmp_cost: order.estimatedPmpCost,
    category: order.category
  }]);
  if (oError) {
    console.error('Error inserting order:', oError);
    return false;
  }

  // Insert Tasks
  const dbTasks = order.tasks.map(t => ({
    id: t.id,
    parent_order_id: t.parentOrderId,
    type: t.type,
    master_profile: t.masterProfile,
    machine_id: t.machineId,
    origins: t.origins,
    target_weight_kg: t.targetWeightKg,
    status: t.status,
    consumed_lots: t.consumedLots || [],
    assigned_silos: t.assignedSilos || [],
    batch_index: t.batchIndex,
    total_batches: t.totalBatches,
    parent_order_total_kg: t.parentOrderTotalKg,
    category: t.category,
    fulfilled_demand_ids: (t as any).fulfilledDemandIds || []
  }));

  const { error: tError } = await supabase.from('roast_tasks').insert(dbTasks);
  if (tError) {
    console.error('Error inserting tasks:', tError);
    return false;
  }
  return true;
};

export const updateTaskStatus = async (taskId: string, status: string, additionalData: any = {}) => {
  const dbUpdates: any = { status };
  if (additionalData.actualWeightKg !== undefined) dbUpdates.actual_weight_kg = additionalData.actualWeightKg;
  if (additionalData.roastedAt !== undefined) dbUpdates.roasted_at = additionalData.roastedAt;
  if (additionalData.roastData !== undefined) dbUpdates.roast_data = additionalData.roastData;

  const { error } = await supabase.from('roast_tasks').update(dbUpdates).eq('id', taskId);
  if (error) console.error('Error updating task:', error);
  return !error;
};

export const updateOrderStatus = async (orderId: string, status: string) => {
  const { error } = await supabase.from('daily_roast_orders').update({ status }).eq('id', orderId);
  if (error) console.error('Error updating order:', error);
  return !error;
};

export const deleteDailyOrder = async (orderId: string) => {
  // Cascading deletes tasks first
  const { error: tError } = await supabase.from('roast_tasks').delete().eq('parent_order_id', orderId);
  if (tError) console.error('Error deleting related tasks:', tError);

  const { error } = await supabase.from('daily_roast_orders').delete().eq('id', orderId);
  if (error) console.error('Error deleting order:', error);
  return !error;
};

export const purgeAllProductionData = async () => {
  // Delete all tasks
  await supabase.from('roast_tasks').delete().neq('id', 'xyz-placeholder');
  
  // Delete all orders
  await supabase.from('daily_roast_orders').delete().neq('id', 'xyz-placeholder');
  
  return true;
};

// =======================
// PLANNER
// =======================

export const fetchPlannerDemands = async () => {
  const { data, error } = await supabase.from('planner_demands').select('*').order('created_at', { ascending: true });
  if (error) {
    console.error('Error fetching planner demands:', error);
    return [];
  }
  return data.map(d => ({
    id: d.id,
    delegation: d.delegation,
    profileName: d.profile_name,
    format: d.format,
    kgRequested: Number(d.kg_requested),
    totalPackages: d.total_packages ? Number(d.total_packages) : undefined,
    status: d.status || 'PENDING'
  }));
};

export const updatePlannerDemandStatus = async (id: string, status: string) => {
  const { error } = await supabase.from('planner_demands').update({ status }).eq('id', id);
  if (error) console.error('Error updating planner demand status:', error);
  return !error;
};

export const createPlannerDemand = async (demand: any) => {
  const { error } = await supabase.from('planner_demands').insert([{
    id: demand.id,
    delegation: demand.delegation,
    profile_name: demand.profileName,
    format: demand.format,
    kg_requested: demand.kgRequested,
    total_packages: demand.totalPackages
  }]);
  if (error) console.error('Error creating planner demand:', error);
  return !error;
};

export const deletePlannerDemand = async (demandId: string) => {
  const { error } = await supabase.from('planner_demands').delete().eq('id', demandId);
  if (error) console.error('Error deleting planner demand:', error);
  return !error;
};

export const fetchPlannerDays = async () => {
  const { data, error } = await supabase.from('planner_days').select('*').order('day_index', { ascending: true });
  if (error) {
    console.error('Error fetching planner days:', error);
    return [];
  }
  return data.map(d => ({
    dayIndex: d.day_index,
    targetSilos: d.target_silos || [],
    siloAssignments: d.silo_assignments || [],
    totalKg: Number(d.total_kg),
    blocks: d.blocks || [],
    scheduledDate: d.scheduled_date,
    fulfilledDemandIds: d.fulfilled_demand_ids || []
  }));
};

export const createPlannerDay = async (day: any) => {
  const { error } = await supabase.from('planner_days').insert([{
    day_index: day.dayIndex,
    target_silos: day.targetSilos,
    silo_assignments: day.siloAssignments,
    total_kg: day.totalKg,
    blocks: day.blocks,
    scheduled_date: day.scheduledDate,
    fulfilled_demand_ids: day.fulfilledDemandIds || []
  }]);
  if (error) console.error('Error creating planner day:', error);
  return !error;
};

export const purgePlannerDays = async () => {
  const { error } = await supabase.from('planner_days').delete().neq('day_index', -1);
  if (error) console.error('Error purging planner days:', error);
  return !error;
};

export const deletePlannerDay = async (dayIndex: number) => {
  const { error } = await supabase.from('planner_days').delete().eq('day_index', dayIndex);
  if (error) console.error('Error deleting planner day:', error);
  return !error;
};

