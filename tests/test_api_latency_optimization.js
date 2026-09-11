'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const APP_PATH = path.join(__dirname, '..', 'app.js');
const appJs = fs.readFileSync(APP_PATH, 'utf8');

describe('API latency optimization contracts', () => {
  it('starts link extraction and bounded image compression concurrently before the main API request', () => {
    assert.match(
      appJs,
      /const\s+linkContextPromise\s*=\s*hasLinks\s*\?\s*fetchLinkContext\(processedText,[\s\S]*?\)\.finally\([\s\S]*?\)\s*:\s*Promise\.resolve\(null\)/,
      'link extraction should start as a promise without blocking image preprocessing'
    );
    assert.match(
      appJs,
      /const\s+compressedImagesPromise\s*=\s*mapWithConcurrency\(images,\s*IMAGE_COMPRESSION_CONCURRENCY,\s*async\s*\(img\)\s*=>/,
      'pending images should be compressed with bounded concurrency'
    );
    assert.match(
      appJs,
      /Promise\.all\(\[linkContextPromise,\s*compressedImagesPromise\]\)/,
      'independent link and image preprocessing should be awaited together'
    );
  });

  it('caps preprocessing concurrency and response bytes for weak laptops', () => {
    assert.match(appJs, /const\s+IMAGE_COMPRESSION_CONCURRENCY\s*=\s*2/);
    assert.match(appJs, /const\s+MAX_LINK_RESPONSE_BYTES\s*=\s*1024\s*\*\s*1024/);
    assert.match(appJs, /readResponseTextLimited\(res,\s*MAX_LINK_RESPONSE_BYTES,\s*options\.signal\)/);
    assert.match(appJs, /reader\.cancel\(\)/);
    assert.match(appJs, /const\s+data\s*=\s*JSON\.parse\(await\s+readResponseTextLimited\(response,\s*maxResponseBytes,\s*options\.signal\)\)/);
    assert.match(appJs, /const\s+data\s*=\s*JSON\.parse\(await\s+readResponseTextLimited\(res,\s*MAX_LINK_RESPONSE_BYTES,\s*options\.signal\)\)/);
  });

  it('fetches multiple link contexts concurrently while preserving input order', () => {
    const start = appJs.indexOf('async function fetchLinkContext(text, options = {})');
    const end = appJs.indexOf('function isPotentialJailbreakOrNSFW', start);
    const body = start >= 0 && end > start ? appJs.slice(start, end) : '';
    assert.ok(body, 'fetchLinkContext must exist');
    assert.match(body, /Promise\.all\(urls\.slice\(0,\s*MAX_LINK_CONTEXT_URLS\)\.map\(async\s*\(link\)\s*=>/);
    assert.doesNotMatch(body, /for\s*\(const\s+link\s+of\s+urls\)/);
    assert.match(body, /urls\.slice\(0,\s*MAX_LINK_CONTEXT_URLS\)\.map/,
      'parallel link enrichment must remain bounded on weak laptops');
  });

  it('bounds optional link enrichment so it cannot indefinitely delay the API request', () => {
    assert.match(appJs, /const\s+LINK_CONTEXT_TIMEOUT_MS\s*=\s*6000/);
    assert.match(appJs, /new\s+AbortController\(\)/);
    assert.match(appJs, /setTimeout\(\(\)\s*=>\s*linkContextController\.abort\(\),\s*LINK_CONTEXT_TIMEOUT_MS\)/);
    assert.match(appJs, /fetchLinkContext\(processedText,\s*\{\s*signal:\s*linkContextController\.signal\s*\}\)/);
  });

  it('cancels preprocessing before it can commit a message or start an API request', () => {
    const sendStart = appJs.indexOf('async function sendMessage()');
    const sendEnd = appJs.indexOf('async function consumeStream', sendStart);
    const body = sendStart >= 0 && sendEnd > sendStart ? appJs.slice(sendStart, sendEnd) : '';
    assert.ok(body, 'sendMessage must exist');
    assert.match(body, /const\s+sendAbortController\s*=\s*new\s+AbortController\(\)/);
    assert.match(body, /State\.abortController\s*=\s*sendAbortController/);
    assert.match(body, /sendAbortController\.signal\.addEventListener\('abort',\s*abortLinkContext/);
    assert.match(body, /await\s+Promise\.all\(\[linkContextPromise,\s*compressedImagesPromise\]\)[\s\S]*?if\s*\(!isCurrentSend\(\)\)\s*\{/);
    assert.ok(
      body.indexOf('if (!isCurrentSend())') < body.indexOf('chat.messages.push(userMsg)'),
      'cancelled preprocessing must stop before committing the captured chat'
    );
  });

  it('reuses the preprocessing AbortController for the response request', () => {
    const start = appJs.indexOf('async function generateAIResponse()');
    const end = appJs.indexOf('// ===== Message Actions =====', start);
    const body = start >= 0 && end > start ? appJs.slice(start, end) : '';
    assert.ok(body, 'generateAIResponse must exist');
    assert.match(body, /const\s+responseAbortController\s*=\s*State\.abortController\s*&&\s*!State\.abortController\.signal\.aborted/);
    assert.match(body, /State\.abortController\s*=\s*responseAbortController/);
    assert.match(body, /finally\s*\{[\s\S]*?if\s*\(State\.abortController\s*===\s*responseAbortController\)\s*\{[\s\S]*?State\.abortController\s*=\s*null/,
      'an older request must not clear cancellation state owned by a newer request');
  });

  it('does not serialize an implicit chamber request ahead of the first visible response token', () => {
    assert.doesNotMatch(
      appJs,
      /await\s+makeApiRequest\(apiMessages,\s*chamberModel\)/,
      'hidden preflight model calls double time-to-first-token for logic/search requests'
    );
  });

  it('computes the model token ceiling once per request', () => {
    assert.ok(appJs.includes('async function makeApiRequest(messages, targetModel)'), 'makeApiRequest must exist');
    assert.match(appJs, /max_tokens:\s*maxTokensCeiling/);
  });
});
