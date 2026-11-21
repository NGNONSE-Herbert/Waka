/** Jetons d'injection NestJS. */
export const CONFIG = Symbol.for('waka.config');
export const DATABASE = Symbol.for('waka.database');
export const LOGGER = Symbol.for('waka.logger');
export const PAYMENT_PROVIDERS = Symbol.for('waka.payment-providers');
export const JOB_QUEUE = Symbol.for('waka.job-queue');
