import { organizationEventStatsConsumer, type EventConsumer } from './events';
import { producerStatusCountsConsumer } from '../producers/producers';

// Registro de consumidores de producción. La API lo usa para crear entregas en el outbox y el worker
// para procesarlas: ambos deben compartir esta lista.
export const PRODUCTION_CONSUMERS: EventConsumer[] = [organizationEventStatsConsumer, producerStatusCountsConsumer];
