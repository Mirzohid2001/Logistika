#!/bin/bash
set -e
cd "$(dirname "$0")"
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

if [ ! -d "Pods" ]; then
  echo "Pods topilmadi. pod install ishga tushirilmoqda..."
  pod install
fi

echo "Logistika.xcworkspace ochilmoqda (xcodeproj emas)..."
open "Logistika.xcworkspace"
