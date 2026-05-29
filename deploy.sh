#!/bin/bash
# ─────────────────────────────────────────────────────────────
# deploy.sh — Push Bananas 2K15 site to GitHub
# Usage: bash deploy.sh
# ─────────────────────────────────────────────────────────────

REPO="https://github.com/jeremiah9980/bananas2k15.git"
BRANCH="main"

echo "🍌 Bananas 2K15 — deploying to GitHub Pages"
echo ""

# Init if needed
if [ ! -d ".git" ]; then
  git init
  git remote add origin "$REPO"
  echo "✓ Initialized git repo"
else
  echo "✓ Git repo already initialized"
fi

# Ensure GitHub Pages is served from root of main branch
# (no /docs subfolder needed — all files are in root)

git add -A
git commit -m "Deploy Bananas 2K15 site and documents — $(date '+%Y-%m-%d %H:%M')"

git branch -M "$BRANCH"
git push -u origin "$BRANCH" --force

echo ""
echo "✓ Pushed to GitHub"
echo ""
echo "Live at: https://jeremiah9980.github.io/bananas2k15/"
echo ""
echo "If GitHub Pages isn't enabled yet:"
echo "  1. Go to github.com/jeremiah9980/bananas2k15"
echo "  2. Settings → Pages"
echo "  3. Source: Deploy from branch → main → / (root)"
echo "  4. Save — site goes live in ~60 seconds"
