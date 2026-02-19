#!/bin/bash

K3S_TOKEN=""
K3S_URL=""

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --token=*) # Handle --token=value
      K3S_TOKEN="${1#--token=}"
      ;;
    --url=*) # Handle --url=value
      K3S_URL="${1#--url=}"
      ;;
    -*) # Catch any other unknown options starting with '-'
      echo "Error: Unknown option $1" >&2
      exit 1
      ;;
    *) # Positional arguments
      break # Stop parsing options, remaining are positional
      ;;
  esac
  shift # Consume the current argument (option or option=value)
done

if command -v k3s &>/dev/null; then
  echo "Uninstalling k3s..."
  /usr/local/bin/k3s-agent-uninstall.sh
fi

curl -sfL https://get.k3s.io | K3S_URL="${K3S_URL}" K3S_TOKEN="${K3S_TOKEN}" sh -