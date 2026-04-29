import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DailyRoastOrder } from '../App';

/**
 * Genera un informe profesional en PDF con el desglose detallado de la producción diaria.
 * Incluye métricas sensoriales de cada tueste, mermas calculadas y destino en silo.
 */
export const generateDailyProductionReport = (orders: DailyRoastOrder[]) => {
   const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
   });
   
   const today = new Date().toLocaleDateString('es-ES', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
   });

   // 1. Cabecera Estilo Industrial
   doc.setFillColor(30, 34, 43); // Dark background for header
   doc.rect(0, 0, 297, 40, 'F');
   
   doc.setTextColor(217, 119, 6); // Coffee Accent Color
   doc.setFontSize(24);
   doc.setFont('helvetica', 'bold');
   doc.text('COFFEE FLOW - ARBITRADE CANARIAS', 15, 20);
   
   doc.setTextColor(255, 255, 255);
   doc.setFontSize(12);
   doc.setFont('helvetica', 'normal');
   doc.text(`INFORME DIARIO DE PRODUCCIÓN Y TRAZABILIDAD - ${today}`, 15, 30);

   // 2. Resumen Ejecutivo
   // CRITICAL FIX: Only count ROAST type tasks for the summary to avoid double-counting BLEND tasks
   const roastTasks = orders.flatMap(o => o.tasks.filter(t => t.type === 'ROAST' && (t.status === 'ROASTED' || t.status === 'RESTING')));
   
   const totalRoastedKg = roastTasks.reduce((acc, t) => acc + (t.actualWeightKg || 0), 0);
   const totalGreenKg = roastTasks.reduce((acc, t) => acc + (t.targetWeightKg || 0), 0);
   const avgShrinkage = totalGreenKg > 0 ? ((totalGreenKg - totalRoastedKg) / totalGreenKg * 100).toFixed(2) : '0.00';
   
   doc.setTextColor(40, 40, 40);
   doc.setFontSize(11);
   doc.text('RESUMEN DE JORNADA:', 15, 52);
   
   autoTable(doc, {
      startY: 55,
      margin: { left: 15 },
      tableWidth: 100,
      body: [
         ['Total Café Verde Procesado', `${totalGreenKg.toFixed(1)} kg`],
         ['Total Café Tostado Producido', `${totalRoastedKg.toFixed(1)} kg`],
         ['Merma Promedio del Día', `${avgShrinkage} %`]
      ],
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 1 },
      columnStyles: { 0: { fontStyle: 'bold' } }
   });

   // 3. Tabla Detallada de Tuestes
   doc.setFontSize(11);
   doc.text('DESGLOSE DE CRONOMETRÍA Y HITOS:', 15, 82);

   const allTasks = orders.flatMap(o => o.tasks.filter(t => t.status === 'ROASTED' || t.status === 'RESTING'));
   let batchCounter = 0;
   
   const tableRows = allTasks.flatMap(t => {
      // For BLEND tasks, we might want a different view, but user asked for "cada tueste"
      if (t.type === 'BLEND') return [];
      
      batchCounter++;
      const shrinkage = t.actualWeightKg ? (((t.targetWeightKg - t.actualWeightKg) / t.targetWeightKg) * 100).toFixed(1) : '--';
      const rd = t.roastData || {} as any;

      const hasData = (val: any) => val !== undefined && val !== null && val !== '' && val !== 0;
      
      // Sequential ID and Origen (Gama)
      const batchId = batchCounter.toString();
      const originGama = `${t.origins[0] || 'Origen'}\n(${t.masterProfile?.name || 'Gama'})`;

      return [[
         batchId,
         originGama,
         `${t.targetWeightKg.toFixed(1)} / ${t.actualWeightKg?.toFixed(1) || '--'}`,
         `${shrinkage}%`,
         hasData(rd.turnaroundTemp) ? `${rd.turnaroundTemp}°C\n(${rd.turnaroundTime || '0:00'})` : '--',
         hasData(rd.yellowTemp) ? `${rd.yellowTemp}°C\n(${rd.yellowTime || '0:00'})` : '--',
         hasData(rd.maillardTemp) ? `${rd.maillardTemp}°C\n(${rd.maillardTime || '0:00'})` : '--',
         hasData(rd.firstCrackTemp) ? `${rd.firstCrackTemp}°C\n(${rd.firstCrackTime || '0:00'})` : '--',
         hasData(rd.finalTemp) ? `${rd.finalTemp}°C\n(${rd.finalTime || '0:00'})` : '--',
         t.assignedSilos ? `Silo ${t.assignedSilos[0]}` : '--'
      ]];
   });

   autoTable(doc, {
      startY: 85,
      head: [['Batch #', 'Origen / Perfil', 'Verde/Tost (kg)', 'Merma', 'TP (Inflex)', 'Amarilla', 'Maillard', '1C (Crack)', 'Drop (Desc)', 'Silo']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [40, 40, 40], fontSize: 8, halign: 'center' },
      styles: { fontSize: 8, halign: 'center', cellPadding: 2 },
      columnStyles: {
         0: { cellWidth: 10 },
         1: { cellWidth: 45, halign: 'left', fontStyle: 'bold' },
         2: { cellWidth: 30 },
         3: { cellWidth: 15 },
         4: { cellWidth: 25 },
         5: { cellWidth: 25 },
         6: { cellWidth: 25 },
         7: { cellWidth: 25 },
         8: { cellWidth: 25 },
         9: { cellWidth: 20 }
      }
   });

   // Footer
   const pageCount = (doc as any).internal.getNumberOfPages();
   for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Generado por Coffee Flow v2.1 - Arbitrade Canarias S.L. - Página ${i} de ${pageCount}`, 15, 200);
   }

   doc.save(`INFORME_PRODUCCION_${today.replace(/[\/:]/g, '_')}.pdf`);
};

/**
 * Genera una Orden de Envasado para la cola de Ejecución de Planta.
 */
export const generatePackagingOrderReport = (orders: DailyRoastOrder[]) => {
   const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
   });

   const today = new Date().toLocaleDateString('es-ES', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric'
   });

   // Cabecera
   doc.setFillColor(30, 34, 43);
   doc.rect(0, 0, 210, 30, 'F');
   
   doc.setTextColor(217, 119, 6);
   doc.setFontSize(18);
   doc.setFont('helvetica', 'bold');
   doc.text('ARBITRADE - ORDEN DE ENVASADO', 15, 15);
   
   doc.setTextColor(255, 255, 255);
   doc.setFontSize(10);
   doc.text(`COLA DE TRABAJO - JORNADA ${today}`, 15, 22);

   const packagingTasks = orders.flatMap(o => 
      o.tasks.filter(t => t.type === 'BLEND' && t.status === 'PENDING')
   );

   if (packagingTasks.length === 0) {
      doc.setTextColor(100, 100, 100);
      doc.text('No hay órdenes de envasado pendientes.', 15, 45);
      doc.save(`ORDEN_ENVASADO_${today.replace(/\//g, '_')}.pdf`);
      return;
   }

   const tableRows = packagingTasks.map((t, idx) => [
      (idx + 1).toString(),
      t.masterProfile?.name || 'GAMA DESCONOCIDA',
      (t.masterProfile as any)?.format || 'ESTÁNDAR',
      `${t.targetWeightKg.toFixed(1)} kg`,
      t.assignedSilos?.join(', ') || '--',
      '[ ] Reposo [ ] Envasado'
   ]);

   autoTable(doc, {
      startY: 40,
      head: [['#', 'Gama / Perfil', 'Formato', 'Cantidad', 'Silos Origen', 'Checklist']],
      body: tableRows,
      headStyles: { fillColor: [30, 34, 43], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 5 },
      columnStyles: {
         0: { cellWidth: 10 },
         1: { cellWidth: 60 },
         3: { fontStyle: 'bold' },
         5: { cellWidth: 40 }
      }
   });

   doc.save(`ORDEN_ENVASADO_${today.replace(/\//g, '_')}.pdf`);
};
