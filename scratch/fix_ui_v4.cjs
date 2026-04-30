const fs = require('fs');
const path = 'c:\\Users\\marqu\\.gemini\\antigravity\\playground\\harmonic-filament\\coffee-flow-canarias\\src\\components\\DailyRoastOrders.tsx';
let content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

const newBlock = `                            {viewMode === 'PACKAGING' ? 'Cola de Envasado & Reposo Operativa' : 'Cola de Tostado Activa'}
                         </p>
                      </div>
                      <div className="flex items-center space-x-4">
                         {roastOrders.length > 0 && roastOrders.every(o => o.status === 'COMPLETED') && (
                            <>
                               <button 
                                 onClick={() => generatePalletShippingReport(roastOrders, demands)}
                                 className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-lg active:scale-95 flex items-center space-x-2"
                               >
                                 <Package className="w-4 h-4" />
                                 <span>Imprimir Hoja Paletizado</span>
                               </button>
                               <button 
                                 onClick={() => generateDailyProductionReport(roastOrders)}
                                 className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-lg active:scale-95 flex items-center space-x-2"
                               >
                                 <FileText className="w-4 h-4" />
                                 <span>Exportar Informe de Producción PDF</span>
                               </button>
                            </>
                         )}
                         {viewMode === 'PACKAGING' && (
                            <button
                               onClick={() => generatePackagingOrderReport(roastOrders, demands)}
                               className="flex items-center space-x-2 bg-coffee-accent hover:bg-coffee-accent/90 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-lg active:scale-95"
                            >
                               <FileText className="w-4 h-4" />
                               <span>Imprimir Orden Envasado</span>
                            </button>
                         )}
                         <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-gray-500 uppercase">Eficiencia Térmica</span>
                            <span className="text-sm font-black text-green-500">OPTIMIZADA</span>
                         </div>`;

lines.splice(1128, 1162 - 1128 + 1, newBlock);
fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log('Fixed DailyRoastOrders.tsx (v4)');
