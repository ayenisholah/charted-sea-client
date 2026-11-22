import { decodeAs, decodeProxyConfigs, decodeProxyValidations } from "../decode.js";
import { ValidationError } from "../errors.js";
import type { Transport } from "../http/transport.js";
import type { ProxyConfig, ProxyValidation } from "../types.js";

export interface ProxiesResource {
  /**
   * Checks proxy URLs against each scraper without changing the configuration.
   * Consumes a little proxy traffic.
   */
  validate(urls: readonly string[], options?: { signal?: AbortSignal }): Promise<ProxyValidation[]>;
  /** Reads the account's proxy configuration. */
  read(options?: { signal?: AbortSignal }): Promise<ProxyConfig[]>;
  /**
   * Replaces the **whole** proxy configuration. All-or-nothing on the server: if any URL is
   * invalid, nothing changes and a {@link ValidationError} is thrown whose `details` is the
   * request echoed back with `invalidUrls` per setting (URL credentials redacted). Never retried.
   */
  update(
    configs: readonly ProxyConfig[],
    options?: { signal?: AbortSignal },
  ): Promise<ProxyConfig[]>;
}

export function createProxies(transport: Transport): ProxiesResource {
  return {
    async validate(urls, options = {}) {
      if (urls.length === 0) throw new ValidationError("validate needs at least one proxy URL");
      const path = "/proxy-validate";
      return transport.request(
        { method: "POST", path, idempotent: true, body: urls, signal: options.signal },
        decodeAs(decodeProxyValidations, `POST ${path}`),
      );
    },
    async read(options = {}) {
      const path = "/proxy-configs";
      return transport.request(
        { method: "GET", path, idempotent: true, signal: options.signal },
        decodeAs(decodeProxyConfigs, `GET ${path}`),
      );
    },
    async update(configs, options = {}) {
      const path = "/proxy-configs";
      return transport.request(
        { method: "PUT", path, idempotent: false, body: configs, signal: options.signal },
        decodeAs(decodeProxyConfigs, `PUT ${path}`),
      );
    },
  };
}
