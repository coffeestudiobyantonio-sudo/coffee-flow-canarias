import React, { useState } from 'react';
import { Package, X, CheckCircle, Database, LayoutTemplate } from 'lucide-react';
import { updateSilo, updateTaskStatus, updateOrderStatus } from '../lib/api';

interface PackagingOverlayProps {
   task: any;
   onClose: () => void;
   silos: any[];
   setSilos?: any;
   roastOrders: any[];
   onSuccess: () => void;
}

export const PackagingOverlay: React.FC<PackagingOverlayProps> = ({ task, onClose, silos, setSilos, roastOrders, onSuccess }) => {
   const [processing, setProcessing] = useState(false);
   const [customTotalKg, setCustomTotalKg] = useState<number>(task.targetWeightKg || 0);

   const profileName = task.parentProfile || 'Generico';
   const isLocalMarket = profileName.includes('Timanfaya') || profileName.includes('Laurisilva') || profileName.includes('Pinzón');

   // Auto-detect format based on profile string
   const lowerName = profileName.toLowerCase();
   let inferredFormat = isLocalMarket ? { '1kg': 100, '450g': 0 } : { '1kg': 100, '500g': 0, '250g': 0 };
   
   if (lowerName.includes('450')) inferredFormat = { '1kg': 0, '450g': 100 };
   else if (lowerName.includes('500')) inferredFormat = { '1kg': 0, '500g': 100, '250g': 0 };
   else if (lowerName.includes('250')) inferredFormat = { '1kg': 0, '500g': 0, '250g': 100 };
   else if (lowerName.includes('1kg') || lowerName.includes('1 kg')) inferredFormat = isLocalMarket ? { '1kg': 100, '450g': 0 } : { '1kg': 100, '500g': 0, '250g': 0 };

   const [formatSplit] = useState(inferredFormat);

   const handleConfirm = async () => {
      if (customTotalKg <= 0) return alert("Cantidad incorrecta.");
      setProcessing(true);

      try {
         // Find assigned Silos and their required ratio for this blend
         // Each ROAST task assigned to an actual silo holds its proportionate green weight.
         const parentOrder = roastOrders.find(o => o.id === task.parentOrderId);
         const originTasks = parentOrder?.tasks.filter((t: any) => t.type === 'ROAST') || [];
         
         const totalGreenRequired = originTasks.reduce((sum: number, t: any) => sum + t.targetWeightKg, 0);

         // Deduct proportional Roasted Kg from physical Silos
         for (const sId of task.assignedSilos) {
             const siloRoastTask = originTasks.find((t: any) => t.assignedSilos?.includes(sId));
             if (siloRoastTask) {
                 const proportion = siloRoastTask.targetWeightKg / totalGreenRequired;
                 const expectedRoastedPull = customTotalKg * proportion;
                 
                 const physicalSilo = silos.find(s => s?.id === sId);
                 if (physicalSilo) {
                    const nextKg = Math.max(0, physicalSilo.currentKg - expectedRoastedPull);
                    await updateSilo(sId, { currentKg: nextKg });
                    if (setSilos) {
                       setSilos((prev: any) => prev.map((s: any) => s?.id === sId ? { ...s, currentKg: nextKg } : s));
                    }
                 }
             }
         }

         // Mark order as COMPLETED
         await updateTaskStatus(task.id, 'COMPLETED');
         for (const originTask of originTasks) {
             await updateTaskStatus(originTask.id, 'COMPLETED');
         }
         await updateOrderStatus(task.parentOrderId, 'COMPLETED');

         alert("Envasado Confirmado: Silos actualizados y Orden cerrada.");
         onSuccess();
         onClose();

      } catch (err) {
         console.error(err);
         alert("Error cerrando ensamble.");
      } finally {
         setProcessing(false);
      }
   };

   // Math Logic for Boxes 
   let summary = null;
   if (isLocalMarket) {
       const kg_1kg = customTotalKg * ((formatSplit['1kg'] || 0) / 100);
       const kg_450g = customTotalKg * ((formatSplit['450g'] || 0) / 100);
       
       const jaulas_1 = Math.floor(kg_1kg / 400); 
       const px_1 = Math.floor(kg_1kg);
       
       const jaulas_450 = Math.floor(kg_450g / 270);
       const px_450 = Math.floor(kg_450g / 0.450);

       summary = (
          <div className="space-y-4">
             <div className="bg-[#1e222b] p-4 rounded-xl border border-dashboard-border">
                <span className="text-xs font-bold text-gray-500 uppercase">Salida en Jaulas Físicas (Local)</span>
                <div className="flex flex-col space-y-2 mt-2">
                   <div className="flex justify-between items-center text-sm">
                      <span className="text-white">Formato 1kg:</span>
                      <span className="font-mono text-green-400">{px_1} pks &rarr; {jaulas_1} Jaulas llenas</span>
                   </div>
                   <div className="flex justify-between items-center text-sm">
                      <span className="text-white">Formato 450g:</span>
                      <span className="font-mono text-green-400">{px_450} pks &rarr; {jaulas_450} Jaulas llenas</span>
                   </div>
                </div>
             </div>
             <p className="text-xs text-gray-400 text-center uppercase tracking-widest">* Los restos remanentes quedarán documentados sin completar jaula.</p>
          </div>
       );
   } else {
       const kg_1kg = customTotalKg * ((formatSplit['1kg'] || 0) / 100);
       const kg_500g = customTotalKg * ((formatSplit['500g'] || 0) / 100);
       const kg_250g = customTotalKg * ((formatSplit['250g'] || 0) / 100);

       const bx_1 = Math.floor(kg_1kg / 12);
       const bx_500 = Math.floor(kg_500g / 12);
       const bx_250 = Math.floor(kg_250g / 12);

       const totalBoxes = bx_1 + bx_500 + bx_250;

       summary = (
          <div className="space-y-4">
             <div className="bg-[#1e222b] p-4 rounded-xl border border-dashboard-border">
                <span className="text-xs font-bold text-gray-500 uppercase">Salida en Cajas (Península)</span>
                <div className="flex flex-col space-y-2 mt-2">
                   {bx_1 > 0 && (
                      <div className="flex justify-between items-center text-sm">
                         <span className="text-white">Formato 1kg (12kg/cj):</span>
                         <span className="font-mono text-green-400">{bx_1} Cajas</span>
                      </div>
                   )}
                   {bx_500 > 0 && (
                      <div className="flex justify-between items-center text-sm">
                         <span className="text-white">Formato 500g (12kg/cj):</span>
                         <span className="font-mono text-green-400">{bx_500} Cajas</span>
                      </div>
                   )}
                   {bx_250 > 0 && (
                      <div className="flex justify-between items-center text-sm">
                         <span className="text-white">Formato 250g (12kg/cj):</span>
                         <span className="font-mono text-green-400">{bx_250} Cajas</span>
                      </div>
                   )}
                </div>
                <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center">
                   <span className="text-xs font-black text-gray-400 uppercase">Total Logística:</span>
                   <span className="text-lg font-black text-white">{totalBoxes} Cajas Totales</span>
                </div>
             </div>
          </div>
       );
   }

   return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
         <div className="bg-dashboard-panel border border-dashboard-border rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col">
            
            <div className="p-6 border-b border-dashboard-border flex justify-between items-center bg-green-500/5">
               <div className="flex items-center space-x-3">
                  <Package className="w-6 h-6 text-green-500" />
                  <h2 className="text-xl font-black text-white uppercase tracking-wider">Mesa de Envasado</h2>
               </div>
               <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                  <X className="w-6 h-6" />
               </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[80vh] space-y-6">
               <div className="text-center">
                  <h3 className="text-2xl font-black text-white mb-2">{task.parentProfile}</h3>
                  <div className="inline-flex items-center space-x-2 px-3 py-1 bg-[#1e222b] rounded-full border border-dashboard-border">
                     <LayoutTemplate className="w-4 h-4 text-green-400" />
                     <span className="text-xs font-bold text-gray-300 uppercase">{isLocalMarket ? 'MERCADO CANARIAS (JAULAS)' : 'PENÍNSULA (PALLETS)'}</span>
                  </div>
               </div>

               <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Total Extraído (Kg Físicos)</label>
                  <input 
                     type="number"
                     value={customTotalKg}
                     onChange={(e) => setCustomTotalKg(Number(e.target.value))}
                     className="w-full bg-black/40 border-2 border-green-500/30 rounded-xl p-4 text-center text-3xl font-black text-green-400 focus:border-green-500 outline-none"
                  />
               </div>

               <div className="space-y-4">
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Desglose de Extracción Simultánea (Silos)</label>
                  <div className="grid grid-cols-2 gap-3">
                     {task.assignedSilos?.map((sId: any) => (
                        <div key={sId} className="bg-[#14161a] p-3 rounded-lg border border-dashboard-border/50 flex items-center space-x-3">
                           <Database className="w-4 h-4 text-blue-400" />
                           <div className="flex flex-col">
                              <span className="text-xs font-bold text-white">Silo {sId}</span>
                              <span className="text-[9px] text-gray-500 font-mono tracking-tighter">Proporción Receta</span>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>

               <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Formato Detectado</label>
                  <div className="inline-flex items-center space-x-2 px-4 py-2 bg-[#14161a] border border-dashboard-border rounded-xl">
                     <span className="text-sm font-bold text-green-400">
                        {formatSplit['1kg'] === 100 ? 'Formato 1 KG' : 
                         formatSplit['500g'] === 100 ? 'Formato 500 GR' : 
                         formatSplit['250g'] === 100 ? 'Formato 250 GR' : 
                         formatSplit['450g'] === 100 ? 'Formato 450 GR' : 'MIX Mixto'}
                     </span>
                  </div>
               </div>

               {summary}

            </div>

            <div className="p-6 border-t border-dashboard-border bg-[#14161a]">
               <button
                  disabled={processing}
                  onClick={handleConfirm}
                  className={`w-full py-4 flex items-center justify-center space-x-2 rounded-xl text-white font-black uppercase tracking-widest transition-all
                     ${processing ? 'bg-green-600/50 cursor-not-allowed' : 'bg-green-600 hover:bg-green-500 active:scale-95 shadow-[0_0_30px_rgba(22,163,74,0.3)]'}
                  `}
               >
                  <CheckCircle className="w-6 h-6" />
                  <span>{processing ? 'Envasando & Actualizando...' : 'Confirmar Envasado & Restar Silos'}</span>
               </button>
            </div>
         </div>
      </div>
   );
};

export default PackagingOverlay;
