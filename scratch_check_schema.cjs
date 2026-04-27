const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = "https://smllmrqnkbprnquorsbs.supabase.co";
const supabaseKey = "sb_publishable_GAqWkfDC1KidHRz4Nlk8XA_vpV9HW4u";
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('roast_tasks').select('*').limit(1);
  if (error) {
    console.error("Error fetching tasks:", error);
    return;
  }
  if (data && data.length > 0) {
    console.log("Columns in roast_tasks:", Object.keys(data[0]));
  } else {
    console.log("No data in roast_tasks to check columns.");
  }
}

check();
