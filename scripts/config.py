"""Offline configuration validation. Never contacts a provider."""
import json, re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
KEYS = {'ALLOWED_NUMBERS', 'DESTINATION', 'OUTBOUND_NUMBER', 'EMAIL_FROM', 'EMAIL_TO', 'CF_ACCOUNT_ID', 'TTS_MODEL', 'TTS_VOICE', 'LIVE_CALLS_ENABLED', 'UNAVAILABLE_PATH'}
def validate(config):
    if set(config) != KEYS:
        raise ValueError('Configuration must contain exactly the keys in config.example.json')
    if not all(isinstance(v, str) and v for v in config.values()):
        raise ValueError('All configuration values must be nonempty strings')
    for n in [*config['ALLOWED_NUMBERS'].split(','), config['DESTINATION'], config['OUTBOUND_NUMBER']]:
        if not re.fullmatch(r'\+[1-9]\d{1,14}', n):
            raise ValueError('Use literal E.164 numbers; no automatic normalization')
    for k in ['EMAIL_FROM', 'EMAIL_TO']:
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', config[k]):
            raise ValueError('Invalid email address')
    if not re.fullmatch(r'[a-fA-F0-9]{32}', config['CF_ACCOUNT_ID']):
        raise ValueError('Set your Cloudflare account ID')
    if config['TTS_VOICE'].startswith('CHOOSE_'):
        raise ValueError('Choose a voice you have permission to use')
    if config['LIVE_CALLS_ENABLED'] not in ['false', 'true'] or config['UNAVAILABLE_PATH'] != '/unavailable.mp3':
        raise ValueError('Invalid live-call switch or fallback path')
    return config

def load():
    return validate(json.loads((ROOT / '.private.json').read_text()))
