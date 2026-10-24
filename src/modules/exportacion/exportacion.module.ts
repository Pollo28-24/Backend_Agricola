import { Module } from '@nestjs/common';
import { ReportesModule } from '../reportes/reportes.module';
import { ExcelExportService } from './services/excel-export.service';
import { CsvExportService } from './services/csv-export.service';
import { PdfExportService } from './services/pdf-export.service';
import { ExportacionService } from './services/exportacion.service';
import { ExportacionController } from './exportacion.controller';

@Module({
  imports: [ReportesModule],
  controllers: [ExportacionController],
  providers: [
    ExcelExportService,
    CsvExportService,
    PdfExportService,
    ExportacionService,
  ],
  exports: [
    ExcelExportService,
    CsvExportService,
    PdfExportService,
    ExportacionService,
  ],
})
export class ExportacionModule {}
