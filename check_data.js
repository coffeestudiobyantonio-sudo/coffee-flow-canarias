import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkData() {
  const { data, error } = await supabase.from('master_profiles').select('*');
  if (error) console.log(error);
  else console.log("Master Profiles:", JSON.stringify(data, null, 2));
}

checkData();
