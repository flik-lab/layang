"use strict";

function createLargeTrackPayload(trackCount = 1000) {
  return {
    tracks: Array.from({ length: trackCount }, (_, index) => ({
      id: `TRACK-${String(index).padStart(5, "0")}`,
      latitude: -6.9 + (index % 100) * 0.001,
      longitude: 107.6 + (index % 100) * 0.001,
      altitude: 1000 + index,
      heading: index % 360,
      speed: 200 + (index % 50),
      classification: "AIR_TRACK",
      description: `endurance-${index}-${"x".repeat(500)}`,
    })),
  };
}

function createResponseRecord(sequence, originalChars) {
  return {
    id: `message-${sequence}`,
    sequence,
    kind: "message",
    title: `Message ${sequence}`,
    timestamp: new Date(1700000000000 + sequence * 1000).toISOString(),
    preview: `track payload ${sequence}`,
    documentId: `document-${sequence}`,
    originalChars,
  };
}

module.exports = { createLargeTrackPayload, createResponseRecord };
