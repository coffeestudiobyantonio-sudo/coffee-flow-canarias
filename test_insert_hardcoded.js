import { createClient } from '@supabase/supabase-js';

const supabase = createClient("https://smllmrqnkbprnquorsbs.supabase.co", "sb_publishable_GAqWkfDC1KidHRz4Nlk8XA_vpV9HW4u");

async function testInsert() {
  console.log("---- Testing insert directly ----");
  const uniqueId = `TEST-${Date.now()}`;
  const lot = {
    id: uniqueId,
    shipping_mark: 'TEST-SHIPMARK',
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
    console.log("SUPABASE INSERT SUCCESS (No Error Return)");
    
    // Test fetch to see if it actually exists
    const { data: fetchResult, error: fetchErr } = await supabase.from('inventory_lots').select('*').eq('id', uniqueId);
    if (fetchErr) {
      console.error("FETCH ERROR:", fetchErr);
    } else {
      console.log("FETCH RETURNED:", fetchResult.length, "rows");
      if (fetchResult.length === 0) {
        console.log("WAIT! IT INSERTED, NO ERROR, BUT NOT FOUND ON FETCH! RLS INVISIBLE INSERT ISSUE DETECTED!");
      }
    }
  }
}

testInsert();
