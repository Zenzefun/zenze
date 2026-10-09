import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTweetBody, readError, readWrite } from "./twitterapis-shape.ts";

describe("twitterapis write shape", () => {
  it("posts text in the JSON body, and names reply_to and quote the way the docs do", () => {
    assert.deepEqual(createTweetBody("Hello"), { text: "Hello" });
    assert.deepEqual(createTweetBody("Hello", "99", "100"), { text: "Hello", reply_to: "99", quote: "100" });
    assert.equal("reply_to_tweet_id" in createTweetBody("Hello", "99"), false);
  });

  it("treats ok:false as a failure even when the HTTP call returned", () => {
    assert.deepEqual(readWrite({ ok: false, tweet_id: null, message: "no session" }), { ok: false, error: "no session" });
    assert.deepEqual(readWrite({ ok: true, tweet_id: "1759", url: "https://x.com/i/status/1759" }), { ok: true, id: "1759" });
  });

  it("says when the session is dead instead of dumping the raw body", () => {
    assert.match(readError(401, JSON.stringify({ error: "session_dead", message: "expired" })), /fresh auth_token/);
    assert.match(readError(402, JSON.stringify({ error: "insufficient_credits" })), /credits are empty/);
  });
});
