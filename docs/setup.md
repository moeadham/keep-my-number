# Setup

Requires Node.js 22, Python 3, ffmpeg, a Twilio account with Functions, Sync and Conversations enabled, an AllModels API key, and Cloudflare Email Sending enabled for your verified sender domain. Porting eligibility and regulatory requirements depend on the number/country; arrange porting with Twilio separately.

## Offline check (no provider calls or billing)

```sh
npm ci
npm test
python3 scripts/deploy.py
```

The plan really bundles the handler into `dist/entry.cjs`. It requires no credentials and performs no remote provisioning or synthesis.

## Configure

Copy `config.example.json` to `.private.json` and replace all examples. The UK numbers are fictional examples. `ALLOWED_NUMBERS` is a comma-separated E.164 allowlist; `DESTINATION` is your receiving phone; `OUTBOUND_NUMBER` must be owned by or verified with Twilio. Use a real Cloudflare account ID and verified `EMAIL_FROM`; `EMAIL_TO` receives the original sender, receiving number, and complete SMS body. Subject: `SMS From: [From] To: [To]`.

Choose a `TTS_MODEL` and **voice ID you have permission to use** from the AllModels catalog. No voice is bundled or preselected. Keep `LIVE_CALLS_ENABLED` as the string `false`; `UNAVAILABLE_PATH` stays `/unavailable.mp3`.

Set these environment variables through your secret manager (never commit them):

- `TWILIO_OUTBOUND_ACCOUNT_SID` and `TWILIO_OUTBOUND_AUTH_TOKEN`: the target Twilio account, used for API provisioning. Functions receive `ACCOUNT_SID`/`AUTH_TOKEN` from Twilio's IncludeCredentials setting.
- `ALLMODELS_API_KEY`: speech access.
- `CF_EMAIL_API_TOKEN`: Cloudflare **Account → Email Sending → Edit**, scoped to your sending account. Email Routing/DNS permissions alone are insufficient. Required on every deploy; a missing token fails before writes rather than removing or silently replacing the existing token.

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
# Explicitly billable; creates only the unavailable prompt:
.venv/bin/python scripts/generate-audio.py --execute
# Explicit provisioning; never routes a number or places a call:
.venv/bin/python scripts/deploy.py --execute
```

Alternatively supply your own permitted MP3 at `audio/unavailable.mp3` with the unavailable message. Deployment validates its size and fully decodes it with ffmpeg before any provider write. Config/state/audio/build/evidence are ignored. Keep `.state.json` private and backed up: it identifies resources for redeployment. Never reuse another project's state or delete state to work around an interrupted build; inspect the recorded build first. Provisioning is not transactional; partial failures may leave billable resources.

The script provisions a dedicated Serverless Service/environment, protected `/entry` Function and `/unavailable.mp3` Asset, Sync Service, and participant-free Conversations Service/Conversation through Twilio REST, then uploads/builds/deploys and reads back the active build and variables. It does not buy numbers, create contact participants, synthesize speech implicitly, or modify existing routes. It refuses live-enabled configuration and state from another account. Redeploying intentionally disables calls; do not deploy to an active routing target without a maintenance plan.

## Activate separately, after testing

Back up the exact incoming-number voice/SMS/application/fallback/status settings first. In the new Functions environment, enable `LIVE_CALLS_ENABLED=true` only when ready for explicitly authorized telephone testing. Set the selected Twilio number's voice webhook to `https://<environment-domain>/entry?mode=voice`, POST, and SMS webhook to `https://<environment-domain>/entry?mode=sms`, POST. Remove conflicting application/fallback routes only after reviewing them. Do not set a number-level status callback to this handler: child/conference callbacks are generated internally with their parent context. Read back number settings and test acceptance, decline, no answer and email receipt; restore the saved settings if testing fails. These activation steps are deliberately not automated.

Never make the Function public: protected visibility verifies Twilio signatures; the handler additionally checks account, numbers and call context. All tests are offline; none originate calls, send email or bill audio. See [limits](limits.md) before production use.
