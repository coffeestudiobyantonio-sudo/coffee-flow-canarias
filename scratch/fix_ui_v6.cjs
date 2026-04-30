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
                         </div>
                         <div className="bg-green-500/10 p-3 rounded-xl border border-green-500/30">
                            <Zap className="w-5 h-5 text-green-500 animate-pulse" />
                         </div>
                      </div>
                   </div>`;

lines.splice(1128, 1167 - 1128 + 1, newBlock);
fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log('Fixed DailyRoastOrders.tsx (v6)');
