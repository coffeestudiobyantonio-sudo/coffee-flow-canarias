import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkColumns() {
  const queries = [
    { 
      table: 'roast_tasks', 
      select: 'id, parent_order_id, type, master_profile, origins, target_weight_kg, status, roast_data, category, roasted_at, parent_order_total_kg, consumed_lots' 
    },
    { 
      table: 'daily_roast_orders', 
      select: 'id, profile_name, total_kg, priority, shrinkage_pct, status, category, estimated_pmp_cost' 
    },
    {
      table: 'silos',
      select: 'id, origin, current_kg, last_fill_date'
    },
    {
      table: 'master_profiles',
      select: 'name, agtron, roasted_type, business_unit, roast_strategy, expected_shrinkage, blend, sensory, machine_profiles'
    }
  ];

  for (const q of queries) {
    console.log(`Checking columns for ${q.table}...`);
    const { error } = await supabase.from(q.table).select(q.select).limit(1);
    if (error) {
      console.log(`❌ ERROR in ${q.table}:`, error.message);
    } else {
      console.log(`✅ ${q.table} OK! All columns exist.`);
    }
  }
}

checkColumns();
