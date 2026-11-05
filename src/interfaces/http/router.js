/** Tiny method + path router. Patterns use ":name" segments, e.g. "/api/games/:id". */
export class Router {
  #routes = [];

  add(method, pattern, handler) {
    const keys = [];
    const regex = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => {
      keys.push(k);
      return '([^/]+)';
    })}/?$`);
    this.#routes.push({ method, regex, keys, handler });
    return this;
  }

  get(p, h) { return this.add('GET', p, h); }
  post(p, h) { return this.add('POST', p, h); }

  /** Returns { handler, params } or { methodNotAllowed: true } or null. */
  match(method, pathname) {
    let pathMatched = false;
    for (const r of this.#routes) {
      const m = pathname.match(r.regex);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      return { handler: r.handler, params };
    }
    return pathMatched ? { methodNotAllowed: true } : null;
  }
}
