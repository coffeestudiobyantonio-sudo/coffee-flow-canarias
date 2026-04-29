import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkColumns() {
  const checks = [
    { 
      table: 'roast_tasks', 
      data: { 
        id: 'test_task', 
        parent_order_id: 'test_order', 
        type: 'ROAST', 
        master_profile: 'test_profile', 
        origins: ['Brazil'], 
        target_weight_kg: 100, 
        status: 'PENDING',
        roast_data: {}, 
        category: 'MDD', 
        roasted_at: 12345, 
        parent_order_total_kg: 100, 
        consumed_lots: [] 
      } 
    },
    { 
      table: 'daily_roast_orders', 
      data: { 
        id: 'test_order', 
        profile_name: 'test_profile', 
        total_kg: 100, 
        priority: 'STOCK', 
        shrinkage_pct: 16, 
        status: 'PLANNED', 
        category: 'MDD', 
        estimated_pmp_cost: 10 
      } 
    }
  ];

  for (const check of checks) {
    console.log(`Checking ${check.table}...`);
    const { error } = await supabase.from(check.table).insert([check.data]);
    if (error) {
      console.log(`Error in ${check.table}:`, error.message);
    } else {
      console.log(`${check.table} OK! (Deleting dummy data...)`);
      await supabase.from(check.table).delete().eq('id', check.data.id);
    }
  }
}

checkColumns();
