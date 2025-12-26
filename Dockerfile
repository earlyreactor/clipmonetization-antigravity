FROM n8nio/n8n:1.123.7

USER root

# Install ffmpeg, python3, headers, venv capabilities, nodejs, and build deps for curl-cffi
# Note: Adding edge repository for fresh tools if needed, though standard alpine packages usually suffice for basics.
RUN apk add --no-cache ffmpeg python3 py3-pip python3-dev build-base nodejs libffi-dev openssl-dev

# Create a virtual environment for yt-dlp
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install yt-dlp with curl-cffi for impersonation support (fixes 429 errors)
# We also install 'brotli' and 'certifi' for robustness
RUN pip install --no-cache-dir "yt-dlp[default]" curl-cffi

# Prepare data directory and ensure permissions
RUN mkdir -p /data/clips && chown -R node:node /data
RUN chown -R node:node /opt/venv

# Verify installs
RUN yt-dlp --version && ffmpeg -version

# Switch back to node user
USER node
