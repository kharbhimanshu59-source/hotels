import { Client, Connection } from '@temporalio/client';
import { config } from '../config';

let clientPromise: Promise<Client> | null = null;

/** Lazily creates one shared Temporal client; retried on next call if it failed. */
export function getTemporalClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = Connection.connect({ address: config.temporalAddress, connectTimeout: 5000 })
      .then((connection) => new Client({ connection, namespace: config.temporalNamespace }))
      .catch((err) => {
        clientPromise = null;
        throw err;
      });
  }
  return clientPromise;
}
