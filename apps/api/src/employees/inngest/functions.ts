import { Inngest } from 'inngest';
import { container } from 'tsyringe';
import { EmployeeRepository } from '../repository';
import { logger } from '../../utils/logger';

/**
 * Creates the Inngest function to rebuild employee_accessible_companies.
 *
 * Uses 5-minute debounce per tenant to batch rapid changes (e.g., bulk import,
 * multiple manager reassignments) into a single rebuild operation.
 *
 * Triggered by 'employee/access.rebuild' event sent from EmployeeService
 * when manager relationships or company assignments change.
 */
export const createRebuildAccessibleCompaniesFunction = (inngest: Inngest) => {
  return inngest.createFunction(
    {
      id: 'rebuild-accessible-companies',
      name: 'Rebuild Employee Accessible Companies',
      debounce: {
        key: 'event.data.tenantId',
        period: '5m', // Batch changes within 5 minutes
      },
      retries: 3,
    },
    { event: 'employee/access.rebuild' },
    async ({ event, step }: { event: any; step: any }) => {
      const { tenantId } = event.data;

      logger.info(
        {
          tenantId,
          eventId: event.id,
        },
        'Inngest: Starting accessible companies rebuild'
      );

      const result = await step.run('rebuild-accessible-companies', async () => {
        const employeeRepository = container.resolve(EmployeeRepository);
        return employeeRepository.rebuildAccessibleCompanies(tenantId);
      });

      logger.info(
        {
          tenantId,
          deletedCount: result.deletedCount,
          insertedCount: result.insertedCount,
          durationMs: result.durationMs,
        },
        'Inngest: Accessible companies rebuild completed'
      );

      return {
        tenantId,
        deletedCount: result.deletedCount,
        insertedCount: result.insertedCount,
        durationMs: result.durationMs,
      };
    }
  );
};
