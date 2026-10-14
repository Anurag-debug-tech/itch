// Isolated parser: bounded worker heap and parent timeout; PDF actions/scripts are never executed.
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS worker, also traced into the production build. */
const { parentPort, workerData } = require('node:worker_threads');
const { PDFDocument } = require('pdf-lib');
(async () => {
  try {
    const document = await PDFDocument.load(workerData, {
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    const pages = document.getPageCount();
    if (pages < 1 || pages > 500) throw new Error('Unsupported page count');
    for (const page of document.getPages()) {
      const { width, height } = page.getSize();
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
        throw new Error('Invalid page geometry');
    }
    parentPort.postMessage({ ok: true, pages });
  } catch {
    parentPort.postMessage({ ok: false });
  }
})();
