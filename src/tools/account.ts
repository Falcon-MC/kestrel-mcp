import { z } from "zod";
import { define, sleep, ToolContext } from "./shared.js";

export function registerAccount(context: ToolContext): void {
  define(
    context,
    "account_status",
    "The Microsoft account state, gamertag and xuid, a pending sign in code, and the realms the account can join (their address is realm:<id>).",
    {},
    async (_args, kestrel) => kestrel.call("account.state"),
    { readOnlyHint: true },
  );

  define(
    context,
    "sign_in",
    "Start a Microsoft sign in and return the link and code a person has to enter. Sign in finishes on its own once they do; check with account_status or pass waitMs to wait here.",
    { waitMs: z.number().int().min(0).max(900000).optional() },
    async (args, kestrel) => {
      let state = await kestrel.call("account.state");
      if (state.state === "signed_in") {
        return state;
      }
      if (state.state !== "awaiting_code") {
        await kestrel.call("account.signIn");
      }
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        state = await kestrel.call("account.state");
        if (state.state === "awaiting_code" || state.state === "signed_in" || state.state === "failed") {
          break;
        }
        await sleep(300);
      }
      if (state.state === "awaiting_code" && args.waitMs) {
        const until = Date.now() + args.waitMs;
        while (Date.now() < until && state.state === "awaiting_code") {
          await sleep(2000);
          state = await kestrel.call("account.state");
        }
      }
      return state;
    },
  );

  define(context, "cancel_sign_in", "Stop a sign in that is waiting for its code.", {}, async (_args, kestrel) => kestrel.call("account.cancel"));

  define(
    context,
    "sign_out",
    "Sign the Microsoft account out, which also leaves the server.",
    {},
    async (_args, kestrel) => kestrel.call("account.signOut"),
    { destructiveHint: true },
  );
}
