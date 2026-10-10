#!/usr/bin/env bash
# cut-release.sh: release one package of the monorepo, Foundry style.
#
#   Usage:  bash scripts/cut-release.sh <core|guard|sort|triage> <major|minor|patch|X.Y.Z> [--dry-run]
#
# From a clean main that is in sync with origin, it:
#   1. bumps packages/<pkg>/package.json (and the lock file),
#   2. prepends a CHANGELOG section built from the conventional commits that touched
#      packages/<pkg> since its last <pkg>-vX.Y.Z tag,
#   3. commits, tags <pkg>-vX.Y.Z, pushes both and creates the GitHub release.
# The tag push runs .github/workflows/publish.yml, which publishes core/guard/sort to
# npm. triage is a GitHub Action (consumed by ref), so its release stops at the tag.
#
# No <pkg>-v tag yet (guard, sort and triage shipped 1.0.0 from their old repos):
#   - a bump works as usual; the changelog starts at the commit that set the current version,
#   - passing the current version (core 0.1.0) releases it as is, changelog from all history.
set -euo pipefail

PKG="${1:-}"
BUMP="${2:-}"
DRY_RUN=false
[ "${3:-}" = "--dry-run" ] && DRY_RUN=true

die()  { echo "cut-release: $*" >&2; exit 1; }
step() { echo "== $* =="; }
run()  { if $DRY_RUN; then echo "  [dry-run] $*"; else eval "$*"; fi; }

require_clean_main() {
  [ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || die "not on main (checkout main first)"
  if ! git diff --quiet || ! git diff --cached --quiet; then die "working tree not clean"; fi
  git fetch -q origin main
  [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || die "main is not in sync with origin/main"
}

package_version() { node -p "require('./packages/$1/package.json').version"; }

tag_exists() { git rev-parse -q --verify "refs/tags/$1" > /dev/null; }

newest_tag() { git tag -l "$1-v*" --sort=-v:refname | head -n 1; } # <pkg>: its last release, if any

version_commit() { # <pkg> <version>: the commit that set this version in package.json
  git log -1 --format=%h -S"\"version\": \"$2\"" -- "packages/$1/package.json"
}

next_version() { # <current> <major|minor|patch>
  local bump="$2" IFS=.
  # shellcheck disable=SC2086  # deliberate: split $1 on IFS=. into major/minor/patch
  set -- $1 ; local maj=$1 min=$2 pat=$3
  case "$bump" in
    major) echo "$((maj+1)).0.0" ;;
    minor) echo "$maj.$((min+1)).0" ;;
    patch) echo "$maj.$min.$((pat+1))" ;;
  esac
}

resolve_version() { # <current> <bump-arg>
  case "$2" in
    major|minor|patch) next_version "$1" "$2" ;;
    [0-9]*.[0-9]*.[0-9]*) echo "$2" ;;
    *) die "bump must be major | minor | patch | X.Y.Z" ;;
  esac
}

range() { if [ -n "$1" ]; then echo "$1..HEAD"; else echo "HEAD"; fi; } # <since-ref-or-empty>

has_breaking() { # <range> <pkg>
  git log "$1" --no-merges --format='%s%n%b' -- "packages/$2" | grep -qE '^[a-z]+([(].+[)])?!:|BREAKING CHANGE'
}

group() { # <range> <pkg> <regex> <title>
  local body
  body=$(git log "$1" --no-merges --format='%h%x09%s' -- "packages/$2" \
    | awk -F'\t' -v re="$3" '$2 ~ re { sub(/^[a-z]+([(].+[)])?!?: */, "", $2); print "* " $2 " (" $1 ")" }')
  [ -n "$body" ] && printf '\n### %s\n\n%s\n' "$4" "$body"
  return 0
}

build_changelog_section() { # <since-ref-or-empty> <tag> <ver> <repo> <pkg>
  local last="$1" tag="$2" ver="$3" repo="$4" pkg="$5" r
  r=$(range "$last")
  if [ -n "$last" ]; then
    printf '## [%s](https://github.com/%s/compare/%s...%s) (%s)\n' "$ver" "$repo" "$last" "$tag" "$(date +%Y-%m-%d)"
  else
    printf '## %s (%s)\n' "$ver" "$(date +%Y-%m-%d)"
  fi
  if has_breaking "$r" "$pkg"; then group "$r" "$pkg" '^[a-z]+([(].+[)])?!:' 'BREAKING CHANGES'; fi
  group "$r" "$pkg" '^feat([(].+[)])?!?:' 'Features'
  group "$r" "$pkg" '^fix([(].+[)])?!?:' 'Bug Fixes'
  echo
}

# Prepend the section above the first "## " heading, creating the file if needed.
insert_changelog() { # <changelog> <section-file>
  [ -f "$1" ] || printf '# Changelog\n\n' > "$1"
  awk -v f="$2" '
    !done && /^## / { while ((getline l < f) > 0) print l; done=1 }
    { print }
    END { if (!done) { while ((getline l < f) > 0) print l } }
  ' "$1" > "$1.new" && mv "$1.new" "$1"
}

main() {
  case "$PKG" in core|guard|sort|triage) ;; *) die "usage: cut-release.sh <core|guard|sort|triage> <major|minor|patch|X.Y.Z> [--dry-run]" ;; esac
  [ -n "$BUMP" ] || die "missing bump (major | minor | patch | X.Y.Z)"
  require_clean_main

  local repo cur ver last="" tag section
  repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
  cur=$(package_version "$PKG")
  ver=$(resolve_version "$cur" "$BUMP")
  tag="$PKG-v$ver"
  tag_exists "$tag" && die "$tag already exists"
  if tag_exists "$PKG-v$cur"; then
    last="$PKG-v$cur"
    [ "$ver" = "$cur" ] && die "$cur is already released; pick a bump"
  else
    # The version was bumped by hand without a release: start after the newest release tag,
    # so the changelog does not repeat what earlier releases already listed.
    last=$(newest_tag "$PKG")
    [ -z "$last" ] && [ "$ver" != "$cur" ] && last=$(version_commit "$PKG" "$cur")
  fi
  step "release $PKG $cur -> $ver ($tag)"

  if [ -n "$last" ] && has_breaking "$(range "$last")" "$PKG" && [ "${ver%%.*}" = "${cur%%.*}" ] && [ "${cur%%.*}" != 0 ]; then
    die "breaking commits since $cur but $ver is not a major bump; use 'major' or an explicit X.Y.Z"
  fi

  section=$(mktemp)
  build_changelog_section "$last" "$tag" "$ver" "$repo" "$PKG" > "$section"
  echo "--- CHANGELOG section ---"; sed 's/^/  /' "$section"

  if [ "$ver" != "$cur" ]; then
    run "npm version '$ver' --workspace 'packages/$PKG' --no-git-tag-version > /dev/null"
  fi
  run "insert_changelog 'packages/$PKG/CHANGELOG.md' '$section'"
  run "git add 'packages/$PKG/package.json' 'packages/$PKG/CHANGELOG.md' package-lock.json"
  run "git commit -q -m 'chore(release): $tag'"
  run "git tag '$tag'"
  run "git push origin main '$tag'"
  run "gh release create '$tag' --title '$tag' --notes-file '$section'"

  if [ "$PKG" = core ] && [ "$ver" != "$cur" ]; then
    echo "Note: guard, sort and triage depend on @cmaintz/jev-core; widen their range if $ver falls outside it."
  fi
  echo "Done: $tag released."
}

if [ "${BASH_SOURCE[0]:-$0}" = "$0" ]; then main; fi
