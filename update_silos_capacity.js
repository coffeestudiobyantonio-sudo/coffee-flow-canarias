import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateSilos() {
  console.log("Updating all roasted silos max_kg to 470...");
  
  const { data, error } = await supabase
    .from('silos')
    .update({ max_kg: 470 })
    .not('id', 'eq', 0); // Exclude the "Green" silo if it existed with 0, but just applying to all valid roasted silos

  if (error) {
    console.error("Update failed:", error);
  } else {
    console.log("Silos updated successfully.");
  }
}

updateSilos();
