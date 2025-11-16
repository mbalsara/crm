import { injectable } from 'tsyringe';

@injectable()
export class Logger {
  log(message: string): void {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }

  error(message: string, error?: Error): void {
    console.error(`[${new Date().toISOString()}] ERROR: ${message}`, error);
  }

  warn(message: string): void {
    console.warn(`[${new Date().toISOString()}] WARN: ${message}`);
  }

  info(message: string): void {
    console.info(`[${new Date().toISOString()}] INFO: ${message}`);
  }
}
