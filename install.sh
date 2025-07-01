#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration ---
# The username to create and grant sudo access to.
NODEUSER=$(whoami)
# The home directory for the user. This is determined automatically.
HOMEDIR="/home/$NODEUSER"
# The full path to the script that the user will be allowed to run.
JOIN_SCRIPT_PATH="$HOME/homelab-ui/join_cluster.sh"
# The name of the file to be created in the /etc/sudoers.d/ directory.
# Using a number prefix (e.g., 91-) is a common convention.
SUDOERS_FILENAME="homelab_permissions"
SUDOERS_FILE_PATH="/etc/sudoers.d/$SUDOERS_FILENAME"

# --- Sudoers File Creation ---
echo "--> Configuring sudo access for '$NODEUSER'..."




echo "--> Creating/overwriting sudoers file at '$SUDOERS_FILE_PATH'..."

sudo tee "$SUDOERS_FILE_PATH" > /dev/null <<EOF
$NODEUSER ALL=(ALL) NOPASSWD: $JOIN_SCRIPT_PATH
$NODEUSER ALL=(ALL) NOPASSWD: /usr/local/bin/k3s-agent-uninstall.sh
$NODEUSER ALL=(ALL) NOPASSWD: /usr/local/bin/k3s-uninstall.sh
EOF


echo "--> Running setup as user: $(whoami) in home directory: $HOMEDIR"

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
