import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
  const { data, error } = await supabase
    .from('roast_tasks')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching data:', error);
    return;
  }

  if (data && data.length > 0) {
    console.log('Columns in roast_tasks:', Object.keys(data[0]));
  } else {
    console.log('No data in roast_tasks, check table structure via API');
    const { data: tableInfo, error: tableError } = await supabase
      .rpc('get_table_info', { table_name: 'roast_tasks' });
    if (tableError) {
      console.error('Error fetching table info:', tableError);
    } else {
      console.log('Table info:', tableInfo);
    }
  }
}

checkColumns();
