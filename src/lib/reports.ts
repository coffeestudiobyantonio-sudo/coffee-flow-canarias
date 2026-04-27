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
   const allTasks = orders.flatMap(o => o.tasks.filter(t => t.status === 'ROASTED' || t.status === 'RESTING'));
   const tableRows = allTasks.flatMap(t => {
      // For BLEND tasks, we might want a different view, but user asked for "cada tueste"
      if (t.type === 'BLEND') return [];
      
      const shrinkage = t.actualWeightKg ? (((t.targetWeightKg - t.actualWeightKg) / t.targetWeightKg) * 100).toFixed(1) : '--';
      const rd = t.roastData || {} as any;

      const hasData = (val: any) => val !== undefined && val !== null && val !== '' && val !== 0;

      return [[
         t.id.split('-').pop() || t.id,
         `${t.masterProfile?.name || '---'}\n(${t.origins[0] || '---'})`,
         `${t.targetWeightKg.toFixed(1)} / ${t.actualWeightKg?.toFixed(1) || '--'}`,
         `${shrinkage}%`,
         hasData(rd.turnaroundTemp) ? `${rd.turnaroundTemp}°C\n(${rd.turnaroundTime && rd.turnaroundTime !== '--' ? rd.turnaroundTime : '0:00'})` : '--',
         hasData(rd.yellowTemp) ? `${rd.yellowTemp}°C\n(${rd.yellowTime && rd.yellowTime !== '--' ? rd.yellowTime : '0:00'})` : '--',
         hasData(rd.maillardTemp) ? `${rd.maillardTemp}°C\n(${rd.maillardTime && rd.maillardTime !== '--' ? rd.maillardTime : '0:00'})` : '--',
         hasData(rd.firstCrackTemp) ? `${rd.firstCrackTemp}°C\n(${rd.firstCrackTime && rd.firstCrackTime !== '--' ? rd.firstCrackTime : '0:00'})` : '--',
         hasData(rd.finalTemp) ? `${rd.finalTemp}°C\n(${rd.finalTime && rd.finalTime !== '--' ? rd.finalTime : '0:00'})` : '--',
         `${rd.devTime || 0}%`,
         t.assignedSilos ? `Silo ${t.assignedSilos[0]}` : '--'
      ]];
   });

   doc.setFontSize(11);
   doc.text('DESGLOSE POR TANDA (BATCHES):', 15, 90);

   autoTable(doc, {
      startY: 95,
      head: [['ID', 'Gama', 'Verde/Tost (kg)', 'Merma', 'TP (Inflex)', 'Amarilla', 'Maillard', '1C (Crack)', 'Drop (Desc)', 'DTR', 'Silo']],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: [30, 34, 43], textColor: [217, 119, 6], fontSize: 8, halign: 'center' },
      styles: { fontSize: 7, halign: 'center', cellPadding: 2 },
      columnStyles: {
         1: { halign: 'left', fontStyle: 'bold', cellWidth: 35 },
         2: { cellWidth: 25 },
         4: { cellWidth: 20 },
         5: { cellWidth: 20 },
         6: { cellWidth: 20 },
         7: { cellWidth: 20 },
         8: { cellWidth: 20 }
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

   const fileDate = new Date().toISOString().split('T')[0];
   doc.save(`Informe_Produccion_${fileDate}.pdf`);
};
