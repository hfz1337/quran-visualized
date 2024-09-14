#!/bin/bash

if [ -z "$1" ]; then
    echo "Usage: $0 <reciter_id>"
    exit 1
fi

RECITER_ID=$1
OUTDIR="data/audio/$RECITER_ID"

mkdir -p $OUTDIR

for SURA in {1..114}; do
    URL="https://api.qurancdn.com/api/qdc/audio/reciters/$RECITER_ID/audio_files?chapter=$SURA&segments=true"

    echo "Downloading Sura $SURA segments..."
    curl -so "$OUTDIR/$SURA.json" $URL

    echo "Downloading Sura $SURA audio..."
    curl -so "$OUTDIR/$SURA.mp3" $(cat "$OUTDIR/$SURA.json" | jq -r '.audio_files[0].audio_url')

    if [ $? -ne 0 ]; then
        echo "Failed to download Sura $SURA"
    fi
done

echo "Download complete for reciter: $RECITER_ID"
