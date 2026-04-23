import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function addColumn() {
  // Try to update one record to see if the column exists
  const { error } = await supabase.from('master_profiles').update({ expected_shrinkage: 16 }).limit(1);
  if (error) {
    console.error("Column likely missing. Please run this SQL in your Supabase SQL editor:");
    console.error("ALTER TABLE master_profiles ADD COLUMN expected_shrinkage NUMERIC DEFAULT 16;");
  } else {
    console.log("Column exists and is writable.");
  }
}

addColumn();
