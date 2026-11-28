// Kept in its own module so tests can replace it; Jest cannot parse import.meta.
export default function createQuantWorker() {
  return new Worker(new URL('./quant.worker.js', import.meta.url));
}
