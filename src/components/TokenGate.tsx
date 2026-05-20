/**
 * TokenGate — backward compatibility shim.
 * The full auth UI is now in LoginGate.
 * This re-export ensures any existing import of TokenGate continues to work.
 */
export { LoginGate as TokenGate } from "./LoginGate";
