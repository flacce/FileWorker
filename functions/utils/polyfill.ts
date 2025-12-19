import { DOMParser } from "@xmldom/xmldom";

if (typeof globalThis.DOMParser === 'undefined') {
    // @ts-ignore
    globalThis.DOMParser = DOMParser;
}
