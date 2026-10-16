// share.js — the code of a game as a URL fragment, and back.
//
// A share link looks like index.html#v1.<data>: the code deflated with the
// browser's CompressionStream and written as base64url. The fragment never
// reaches the server, so no one's code lands in logs. The "v1." prefix lets
// the encoding change later without breaking old links: decode refuses any
// other version instead of guessing.

export const VERSION = "v1";

// "deflate" rather than "deflate-raw": the two-byte header and the checksum
// cost six bytes and make a mangled link fail to decode instead of coming
// out as garbage.
const FORMAT = "deflate";

// The fragment (without the "#") that carries `code`.
export async function encode(code) {
	const packed = await pipe(new TextEncoder().encode(code), new CompressionStream(FORMAT));
	return `${VERSION}.${toBase64url(packed)}`;
}

// The code a fragment carries, with or without its leading "#". Throws on a
// missing or unknown version prefix, on characters that are not base64url,
// and on data that does not inflate to UTF-8 text.
export async function decode(fragment) {
	const text = fragment.startsWith("#") ? fragment.slice(1) : fragment;
	const dot = text.indexOf(".");
	const version = dot < 0 ? "" : text.slice(0, dot);
	if (version !== VERSION) throw new Error(version ? `Unknown link version "${version}"` : "Not a Zot link");
	const data = text.slice(dot + 1);
	if (!data) throw new Error("The link carries no code");
	const bytes = await pipe(fromBase64url(data), new DecompressionStream(FORMAT));
	return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

// `bytes` run through `transform` (a compression or decompression stream)
async function pipe(bytes, transform) {
	const stream = new Blob([bytes]).stream().pipeThrough(transform);
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

// base64url: base64 with "-" and "_" for "+" and "/", and no "=" padding, so
// the result needs no escaping in a URL.
function toBase64url(bytes) {
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text) {
	if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error("The link has characters that are not base64url");
	const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
	const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
	return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
