"use strict";

const { BrowserWindow } = require("electron");

function windowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function errorMessage(error) {
  return error?.message ? String(error.message) : String(error);
}

function okResponse(result) {
  return { ok: true, ...(result || {}) };
}

function errorResponse(error) {
  return { ok: false, error: errorMessage(error) };
}

module.exports = { errorMessage, errorResponse, okResponse, windowFromEvent };
