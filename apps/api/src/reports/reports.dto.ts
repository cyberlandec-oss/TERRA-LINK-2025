import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

/** Período de los indicadores de actividad. Fechas ISO (YYYY-MM-DD); ambas opcionales y sin límite por defecto. */
export class ReportPeriodDto {
  @ApiPropertyOptional({ example: '2026-09-01', description: 'Inicio del período (inclusive) para los indicadores de actividad.' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from debe tener el formato YYYY-MM-DD.' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Fin del período (inclusive) para los indicadores de actividad.' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to debe tener el formato YYYY-MM-DD.' })
  to?: string;
}
