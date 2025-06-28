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

# --- User Creation ---
# Check if the user already exists.
# if ! id -u "$NODEUSER" >/dev/null 2>&1; then
#   echo "--> Creating system user '$NODEUSER' with home directory at '$HOME'..."
#   # Create the user with a home directory (-m) and set the shell to nologin.
#   sudo useradd -m -s /usr/sbin/nologin "$NODEUSER"
#   echo "--> User '$NODEUSER' created successfully."
# else
#   echo "--> User '$NODEUSER' already exists. Skipping creation."
# fi

# --- Sudoers File Creation ---
echo "--> Configuring sudo access for '$NODEUSER'..."

# Define the rule that will be written into the sudoers file.
# This rule allows NODEUSER to run the JOIN_SCRIPT_PATH as any user (ALL)
# on any host (ALL) without being prompted for a password (NOPASSWD).
SUDOERS_RULE="$NODEUSER ALL=(ALL) NOPASSWD: $JOIN_SCRIPT_PATH"

echo "--> Creating/overwriting sudoers file at '$SUDOERS_FILE_PATH'..."
# Use 'tee' with 'sudo' to write the rule to the sudoers file.
# This will overwrite the file if it exists, or create it if it doesn't.
# The output is redirected to /dev/null to keep the script output clean.
echo "$SUDOERS_RULE" | sudo tee "$SUDOERS_FILE_PATH" > /dev/null


echo ""
echo "✅ Setup complete."
echo "The '$NODEUSER' user can now execute the following command via sudo without a password:"
echo "   sudo $JOIN_SCRIPT_PATH"



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
