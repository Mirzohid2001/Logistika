#!/bin/zsh
set -euo pipefail

ROOT="/Users/alirizokarimov/Desktop/Logistika/artifacts/logivo-demo"
CLIPS="$ROOT/clips"
CARDS="$ROOT/cards"
CLIENT="/var/tmp/logivo-client-raw.mp4"
DRIVER="/var/tmp/logivo-driver-raw.mp4"
ORDERS="/var/tmp/logivo-driver-orders-clean.mp4"

encode_card() {
  local input="$1"
  local duration="$2"
  local fade_out="$3"
  local output="$4"
  ffmpeg -y -loop 1 -i "$input" -t "$duration" \
    -vf "scale=1080:1080,pad=1080:1920:0:420:color=0x07131c,fps=30,fade=t=in:st=0:d=0.45,fade=t=out:st=${fade_out}:d=0.45" \
    -an -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p "$output"
}

encode_clip() {
  local input="$1"
  local start="$2"
  local raw_duration="$3"
  local output_duration="$4"
  local ratio="$5"
  local output="$6"
  ffmpeg -y -i "$input" \
    -vf "trim=start=${start}:duration=${raw_duration},scale=-2:1920,pad=1080:1920:(ow-iw)/2:0:color=0x07131c,setpts=${ratio}*(PTS-STARTPTS),fps=30,tpad=stop_mode=clone:stop_duration=${output_duration}" \
    -t "$output_duration" -an -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p "$output"
}

encode_card "$CARDS/intro.svg.png" 8 7.55 "$CLIPS/00-intro.mp4"
encode_clip "$CLIENT" 0 18 12 0.666666667 "$CLIPS/01-client-home.mp4"
encode_clip "$CLIENT" 18 32 15 0.46875 "$CLIPS/02-client-analytics.mp4"
encode_clip "$CLIENT" 64 32 15 0.46875 "$CLIPS/03-client-listing.mp4"
encode_clip "$CLIENT" 195 28 14 0.5 "$CLIPS/04-client-tracking.mp4"
encode_clip "$CLIENT" 238 36 12 0.333333333 "$CLIPS/05-client-chats.mp4"
encode_clip "$CLIENT" 310 42 12 0.285714286 "$CLIPS/06-client-balance.mp4"
encode_card "$CARDS/driver.svg.png" 6 5.55 "$CLIPS/07-driver-card.mp4"
encode_clip "$DRIVER" 0 15 12 0.8 "$CLIPS/08-driver-home.mp4"
encode_clip "$DRIVER" 70 40 16 0.4 "$CLIPS/09-driver-search.mp4"
encode_clip "$DRIVER" 110 20 8 0.4 "$CLIPS/10-driver-load-top.mp4"
encode_clip "$DRIVER" 185 25 8 0.32 "$CLIPS/11-driver-load-bottom.mp4"
encode_clip "$ORDERS" 28 22 5 0.227272727 "$CLIPS/12-driver-orders.mp4"
encode_clip "$ORDERS" 52 22 5 0.227272727 "$CLIPS/13-driver-order-detail.mp4"
encode_clip "$ORDERS" 70 14 4 0.285714286 "$CLIPS/14-driver-tracking.mp4"
encode_clip "$DRIVER" 332 16 5 0.3125 "$CLIPS/15-driver-profile-top.mp4"
encode_clip "$DRIVER" 348 17 5 0.294117647 "$CLIPS/16-driver-profile-mid.mp4"
encode_clip "$DRIVER" 365 14 4 0.285714286 "$CLIPS/17-driver-profile-low.mp4"
encode_clip "$DRIVER" 372 35 10 0.285714286 "$CLIPS/18-driver-balance.mp4"
encode_card "$CARDS/outro.svg.png" 4 3.55 "$CLIPS/19-outro.mp4"

ffmpeg -y -f concat -safe 0 -i "$ROOT/concat.txt" -c copy -movflags +faststart "$ROOT/Logivo-client-driver-demo-3min.mp4"

ffmpeg -y -i "$ROOT/Logivo-client-driver-demo-3min.mp4" \
  -f lavfi -i anullsrc=r=48000:cl=stereo \
  -map 0:v:0 -map 1:a:0 \
  -vf "scale=1080:1920:flags=lanczos,format=yuv420p,fps=30" \
  -c:v libx264 -preset veryfast -crf 22 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -c:a aac -b:a 128k -t 180 -shortest -movflags +faststart \
  "$ROOT/Logivo-client-driver-demo-3min-final.mp4"
