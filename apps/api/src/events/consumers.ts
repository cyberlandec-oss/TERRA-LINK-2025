import { organizationEventStatsConsumer, type EventConsumer } from './events';
import { producerStatusCountsConsumer } from '../producers/producers';
import { riskReevaluationConsumer } from '../mitigations/mitigations';

// Registro de consumidores de producción. La API lo usa para crear entregas en el outbox y el worker
// para procesarlas: ambos deben compartir esta lista.
// risk-reevaluation (P0-021): reevalúa el lote tras una mitigación verificada.
export const PRODUCTION_CONSUMERS: EventConsumer[] = [organizationEventStatsConsumer, producerStatusCountsConsumer, riskReevaluationConsumer];
