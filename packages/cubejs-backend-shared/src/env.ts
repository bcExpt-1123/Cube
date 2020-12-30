import { get } from 'env-var';

export function convertTimeStrToMs(input: string, envName: string) {
  if (/^\d+$/.test(input)) {
    return parseInt(input, 10);
  }

  if (input.length > 1) {
    // eslint-disable-next-line default-case
    switch (input.substr(-1).toLowerCase()) {
      case 'h':
        return parseInt(input.slice(0, -1), 10) * 60 * 60;
      case 'm':
        return parseInt(input.slice(0, -1), 10) * 60;
      case 's':
        return parseInt(input.slice(0, -1), 10);
    }
  }

  throw new Error(
    `${envName} is a time, must be number (in seconds) or string in time format (1s, 1m, 1h)`
  );
}

export function asPortNumber(input: number, envName: string) {
  if (input < 0) {
    throw new Error(`${envName} is a port number, should be a positive integer`);
  }

  if (input > 65535) {
    throw new Error(`${envName} is a port number, should be lower or equal than 65535`);
  }

  return input;
}

export function asPortOrSocket(input: string, envName: string): number|string {
  if (/^-?\d+$/.test(input)) {
    return asPortNumber(parseInt(input, 10), envName);
  }

  // @todo Can we check that path for socket is valid?
  return input;
}

const variables = {
  devMode: () => get('CUBEJS_DEV_MODE')
    .default('false')
    .asBoolStrict(),
  port: () => asPortOrSocket(process.env.PORT || '4000', 'PORT'),
  tlsPort: () => asPortOrSocket(process.env.TLS_PORT || '4433', 'TLS_PORT'),
  tls: () => get('CUBEJS_ENABLE_TLS')
    .default('false')
    .asBoolStrict(),
  webSockets: () => get('CUBEJS_WEB_SOCKETS')
    .default('false')
    .asBoolStrict(),
  refreshTimer: () => get('CUBEJS_SCHEDULED_REFRESH_TIMER')
    .asInt(),
  scheduledRefresh: () => get('CUBEJS_SCHEDULED_REFRESH')
    .asBool(),
  dockerImageVersion: () => get('CUBEJS_DOCKER_IMAGE_VERSION')
    .asString(),
  // It's only excepted for CI, nothing else.
  internalExceptions: () => get('INTERNAL_EXCEPTIONS_YOU_WILL_BE_FIRED')
    .default('false')
    .asEnum(['exit', 'log', 'false']),
  preAggregationsSchema: () => get('CUBEJS_PRE_AGGREGATIONS_SCHEMA')
    .asString(),
  dbPollTimeout: () => {
    const value = process.env.CUBEJS_DB_POLL_TIMEOUT || '15m';
    return convertTimeStrToMs(value, 'CUBEJS_DB_POLL_TIMEOUT');
  },
  dbPollMaxInterval: () => {
    const value = process.env.CUBEJS_DB_POLL_MAX_INTERVAL || '5s';
    return convertTimeStrToMs(value, 'CUBEJS_DB_POLL_MAX_INTERVAL');
  }
};

type Vars = typeof variables;

export function getEnv<T extends keyof Vars>(key: T): ReturnType<Vars[T]> {
  return <any>variables[key]();
}

export function isDockerImage(): boolean {
  return Boolean(process.env.CUBEJS_DOCKER_IMAGE_TAG);
}
