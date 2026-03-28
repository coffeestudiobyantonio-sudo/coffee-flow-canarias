import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testInsert() {
  console.log("Testing insert...");
  const lot = {
    id: `TEST-${Date.now()}`,
    shipping_mark: 'TEST',
    origin: 'Colombia',
    moisture: 10.5,
    density: 800,
    arrival_date: '2026-03-28',
    status: 'VALIDATED',
    stock_kg: 100,
    original_stock_kg: 100,
    price_per_kg: 5.0,
    exclusive_for: 'NONE'
  };

  const { data, error } = await supabase.from('inventory_lots').insert([lot]);
  
  if (error) {
    console.error("SUPABASE ERROR:", error);
  } else {
    console.log("SUPABASE SUCCESS:", data);
  }
}

testInsert();
