import { getDb, type Row } from './db';
export const now = () =>
  new Date(
    Date.now() +
      Number(
        (
          getDb().prepare("SELECT value FROM settings WHERE key='clockOffset'").get() as
            Row | undefined
        )?.value || 0,
      ),
  ).toISOString();
