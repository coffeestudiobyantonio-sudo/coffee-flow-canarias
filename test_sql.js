import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('daily_roast_orders').insert([{
    id: 'TEST-PLAN-1234',
    profile_name: 'Plan Auto',
    total_kg: 250,
    priority: 'STOCK',
    shrinkage_pct: 0.16,
    status: 'PLANNED',
    category: 'MARCA_PROPIA'
  }]);
  console.log('Error output for STOCK with PLANNED:', error);
  await supabase.from('daily_roast_orders').delete().eq('id', 'TEST-PLAN-1234');
}
check();
