# Bump the version, tag, push, and create a GitHub release.
# CI picks up the release and publishes to npm.
release bump:
    npm run typecheck
    npm version {{bump}} -m "chore: bump version to %s"
    jj bookmark set main -r @-
    jj git push --bookmark main
    gh release create "v$(node -p "require('./package.json').version")" --generate-notes
