#!/bin/bash

set -e


# Download and install nvm:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

# in lieu of restarting the shell
\. "$HOME/.nvm/nvm.sh"

# Download and install Node.js:
nvm install 22

# Verify the Node.js version:
node -v # Should print "v22.17.0".
nvm current # Should print "v22.17.0".

# Download and install pnpm:
corepack enable pnpm

# Verify pnpm version:
pnpm -v


if [ ! -d "homelab-ui/.git" ]; then
  # Clone the repository if it doesn't exist:
  git clone https://github.com/mauriciomelo/homelab-ui.git
  cd homelab-ui
else
  # If it exists, pull the latest changes:
  cd homelab-ui
  git pull
fi



# Install dependencies:
pnpm install

# Start the server (dev mode for now):
pnpm dev