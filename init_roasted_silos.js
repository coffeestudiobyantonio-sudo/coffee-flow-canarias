import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function initRoastedSilos() {
  console.log("Emptying green silos...");
  await supabase.from('silos').delete().neq('id', 0); // Clear all existing silos
  
  console.log("Initializing 8 Roasted Coffee Silos (400kg capacity)...");
  const newSilos = Array.from({ length: 8 }).map((_, i) => ({
    id: i + 1,
    origin: null, // this will hold profileName conceptually
    moisture: null,
    lot_id: null,
    current_kg: 0,
    max_kg: 400
  }));

  const { data, error } = await supabase.from('silos').insert(newSilos);
  
  if (error) {
    console.error("SUPABASE ERROR:", error);
  } else {
    console.log("Successfully created 8 roasted silos.");
  }
}

initRoastedSilos();
