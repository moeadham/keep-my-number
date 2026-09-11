# Keep My Number

Keep your old phone number without keeping its old SIM. Port it to Twilio, receive SMS by email, and forward calls to your current phone.

**Calls connect only after you press 1.** You hear who is calling and which number they dialed; voicemail cannot accept the call. No answer or rejection plays an unavailable message and hangs up. No voicemail or call recording.

Twilio Studio → protected Function → Cloudflare Worker + Durable Objects. Cloudflare sends email; AllModels generates spoken prompts, cached privately with short-lived signed audio links.

## Setup

You need Node.js 22.13+, Python 3, FFmpeg, Twilio, Cloudflare Workers/Email Sending, and an AllModels key with a voice you have permission to use.

```sh
npm ci
npm test
npm run build             # offline deployment dry-run
cp wrangler.example.json wrangler.json
# Edit your numbers, email addresses, account SID, Worker URL and TTS_VOICE.
```

Then follow [deployment setup](docs/setup.md) for secrets, audio and Twilio provisioning. There is no bundled voice or audio. Your local configuration and generated media are ignored.

Portability, voice/SMS support and outbound calling permissions depend on the country, number type and carriers. Confirm port eligibility with Twilio before cancelling your old service; some senders will not deliver verification texts to VoIP numbers. MMS attachments are not forwarded.

You pay for number rental, incoming/outgoing call legs, conferences, SMS, Studio/Functions, Cloudflare/email and speech generation. Set provider spending alerts; this is not a free forwarding service or an emergency-calling replacement.

**License:** [MIT](LICENSE).
