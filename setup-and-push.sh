#!/usr/bin/env bash
# Rebel Reaper → GitHub Pages setup script
# Run this once from this directory to push everything to GitHub.

set -e

REPO_URL="https://github.com/CodedInk/rebel-reaper.git"
BRANCH="main"

cd "$(dirname "$0")"

echo "==> Cleaning any existing .git folder from sandbox setup..."
rm -rf .git

echo "==> Initializing fresh git repo..."
git init -b "$BRANCH"

echo "==> Configuring identity (uses your global git config if set)..."
# If you haven't configured git globally, uncomment these and put your info:
# git config user.name  "Your Name"
# git config user.email "you@example.com"

echo "==> Adding remote..."
git remote add origin "$REPO_URL" 2>/dev/null || git remote set-url origin "$REPO_URL"

echo "==> Staging files (.gitignore handles excludes)..."
git add -A

echo "==> First commit..."
git commit -m "Initial Rebel Reaper storefront

- 154 product pages + 15 categories
- Cart, checkout, account, wishlist, search (localStorage)
- Admin CMS (/admin.html)
- AI assistant 'The Reaper' chibi mascot
- Product reviews + size guides
- Sale treatment with savings shown in cart
- Mobile nav + mega menu
- Ready for GitHub Pages serving from /"

echo ""
echo "==> Repo size:"
du -sh .

echo ""
echo "==> Pushing to $REPO_URL ..."
echo "    (you'll be prompted for credentials if not cached)"
git push -u origin "$BRANCH"

echo ""
echo "============================================================"
echo "  ✓ Pushed to $REPO_URL"
echo ""
echo "  Next: enable GitHub Pages"
echo "  1. Open https://github.com/CodedInk/rebel-reaper/settings/pages"
echo "  2. Source: 'Deploy from a branch'"
echo "  3. Branch: '$BRANCH' / '/ (root)'"
echo "  4. Save"
echo ""
echo "  Site will be live at:"
echo "    https://codedink.github.io/rebel-reaper/"
echo "  (allow ~2 minutes for first build)"
echo "============================================================"
