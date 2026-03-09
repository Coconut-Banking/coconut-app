#!/bin/bash
# Ensures Node is on PATH (nvm or fallback), then starts Expo
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh"
elif [ -d "$HOME/.nvm/versions/node" ]; then
  export PATH="$HOME/.nvm/versions/node/v25.6.0/bin:$PATH"
fi
cd "$(dirname "$0")"
# Use your Mac's IP so your phone can connect (same WiFi required)
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "192.168.1.10")
export REACT_NATIVE_PACKAGER_HOSTNAME="$IP"
export CI=false
exec npx expo start
