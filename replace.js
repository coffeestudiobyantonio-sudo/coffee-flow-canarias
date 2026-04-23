import fs from 'fs';
let c = fs.readFileSync('src/components/DailyRoastOrders.tsx', 'utf8');
const search = "{assignedSiloObj?.profileName || 'Origen'}";
const replace = "{roastOrders.find(o => o.id === task.parentOrderId)?.tasks.find(t => t.type === 'ROAST' && t.assignedSilos?.includes(sId))?.origins?.[0] || assignedSiloObj?.profileName || 'Origen'}";
c = c.split(search).join(replace);
fs.writeFileSync('src/components/DailyRoastOrders.tsx', c);
console.log('Replaced successfully.');
