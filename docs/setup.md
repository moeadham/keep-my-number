# Deployment setup

## 1. Accounts and configuration

Check [Twilio porting eligibility](https://www.twilio.com/en-us/phone-numbers/porting). Keep your existing service active until the port completes. Enable the destination country's outbound Voice geographic permissions; trial accounts may require verified destinations. Use a voice-capable Twilio number you own for OUTBOUND_FROM, and only your inbound Twilio numbers in ALLOWED_NUMBERS. FORWARD_TO must not route back to this app.

Use a Cloudflare account with Workers Paid/Durable Objects and [Email Sending](https://developers.cloudflare.com/email-service/) enabled. Verify your sending domain and destination as required by your account. The EMAIL binding restrictions must match EMAIL_FROM and EMAIL_TO. This app uses the structured Email Sending API, not a third-party mail vendor.

`wrangler.example.json` contains fictional NANP 555-0100/0101 numbers, example.com mailboxes, a zero-filled test SID and no account/resource bindings. Set your own values in ignored `wrangler.json`. Set PUBLIC_ORIGIN to your final HTTPS workers.dev/custom-domain URL, without a trailing slash. You may add your Cloudflare account_id there for multi-account use. Set TTS_VOICE explicitly to a voice you are licensed/authorized to use; TTS_MODEL defaults to fish/s2-1-pro. The pronunciation format uses Fish `[break]` markers; changing provider/model requires testing.

## 2. Secrets, audio and Worker

Authenticate Wrangler to your own account. These commands change that account and incur costs; dry-run/test commands do not deploy.

```sh
npx wrangler login
# Set ALLMODELS_API_KEY in your shell without saving it to this repository.
npm run audio
npm run deploy
npx wrangler secret put TWILIO_AUTH_TOKEN --config wrangler.json
npx wrangler secret put AUDIO_SECRET --config wrangler.json
npx wrangler secret put ALLMODELS_API_KEY --config wrangler.json
```

Enter your Twilio account auth token, a fresh random AUDIO_SECRET (at least 32 random bytes), and AllModels API key at the prompts. Do not route any numbers until all secrets are installed. The audio command makes one billed speech request, decodes the result with FFmpeg, and creates ignored src/audio.json containing only the unavailable prompt. Rerun audio and redeploy when changing its voice/model. npm ci creates an empty audio file if absent so a clean checkout can test/build; real deployment refuses empty audio.

## 3. Twilio Function and Studio

Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in your shell, matching the Worker account. Optionally set TWILIO_SERVICE_NAME to a unique service name (default phone-forwarder).

```sh
npm run twilio:plan       # local flow generation; no credentials/network needed
npm run twilio:deploy     # creates/updates isolated Function and published Studio flow
```

The protected Function signs requests to the Worker using the same Twilio auth token. Provisioning IDs and generated Studio JSON are stored only in ignored .state/. Keep that directory private and retain it for subsequent updates; deleting it causes the script to attempt a new service. The script verifies the active Functions build and Studio definition. It never changes phone-number routes.

In Twilio's number configuration, explicitly select the generated Studio flow for incoming calls and incoming messages only when ready. Save the old routes first for rollback. Verify receipt with an SMS and an authorized call; provider acceptance is not proof of delivery. Deployment and live calling have not been tested against your account by this repository's offline test suite.

## Behavior and privacy

Calls ring for 25 seconds. After the private prompt, you have 10 seconds to press 1. Speech failure fails closed. SMS text/Unicode and sender/recipient are preserved in email; MMS media is not included. SMS deduplication favors avoiding duplicate email: uncertain sends are not retried automatically.

Dynamic speech uses complete sentences, international libphonenumber grouping and spelled digits. The private cache keys include model, voice and text, expires audio after seven days, and caps synthesis at 100 attempts/day with four concurrent requests. Signed audio URLs last two minutes. Cache and call/SMS state contain personal information; restrict account access and define your own retention/deletion policy. Call/SMS state is not automatically purged by this implementation. Email and telephony providers also retain data under their policies. Observability is disabled by default; enabling logging may expose metadata.

Never publish .state/, wrangler.json, .dev.vars, generated src/audio.json, recordings, provider logs or credentials. No voice recordings or cloned-voice rights are supplied.
