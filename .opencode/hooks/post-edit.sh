#!/bin/bash
# Post-edit hook: Automatically lint and format files after Edit/Write operations
# This hook runs after any file modification by opencode

FILE="$1"

# Only process TypeScript, JavaScript, and JSON files
if [[ "$FILE" =~ \.(ts|tsx|js|jsx|json)$ ]]; then
  # Skip node_modules and dist
  if [[ "$FILE" =~ node_modules|dist|\.turbo ]]; then
    exit 0
  fi
  
  # Run biome to fix the file
  npx @biomejs/biome check --write "$FILE" 2>/dev/null || true
fi
