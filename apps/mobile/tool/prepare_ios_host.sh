#!/usr/bin/env bash
# Run from apps/mobile on a macOS host with the pinned Flutter SDK.
set -euo pipefail
backup_dir=$(mktemp -d)
trap 'rm -rf "$backup_dir"' EXIT
cp pubspec.yaml pubspec.lock "$backup_dir/"
cp -R lib "$backup_dir/lib"
# Keep a single, reproducible CocoaPods integration for the current plugins.
flutter config --no-enable-swift-package-manager
flutter create --platforms=ios --org net.shotech --project-name gym_network --no-pub .
cp "$backup_dir/pubspec.yaml" "$backup_dir/pubspec.lock" .
cp -R "$backup_dir/lib/." lib/
rm -f test/widget_test.dart
python3 tool/prepare_ios.py
flutter pub get
(cd ios && pod install)
