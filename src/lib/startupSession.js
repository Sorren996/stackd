import { runStartupCheck } from '@/lib/startupRequest';
import { startupSessionRead } from '@/lib/startupHttp';

// One auth.me read shared by bootstrap and resource-401 revalidation. This is
// in-flight deduplication only, never a cached session or an auth substitute.
export default function createStartupSession(client) {
  let flight = null;
  let controller = null;
  return {
    read() {
      if (flight) return flight;
      controller = new AbortController();
      const work = runStartupCheck('auth', 'auth', async signal => {
        const user = await startupSessionRead(client, signal);
        if (!user?.id) throw Object.assign(new Error('Invalid session response'), { startupInvalid: true });
        return user;
      }, controller.signal).finally(() => { if (flight === work) flight = null; });
      flight = work;
      return work;
    },
    settle() {
      return flight ? flight.then(() => {}, () => {}) : Promise.resolve();
    },
    retire() {
      controller?.abort();
      flight = null;
    },
  };
}