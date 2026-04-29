import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkTasks() {
  const { data, error } = await supabase.from('roast_tasks').select('*').limit(5);
  if (error) console.log(error);
  else console.log("Tasks:", JSON.stringify(data, null, 2));
}

checkTasks();
