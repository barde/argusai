import type { JWTPayload } from '../utils/jwt';

declare module 'hono' {
  interface ContextVariableMap {
    user: JWTPayload;
  }
}
