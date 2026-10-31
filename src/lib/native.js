import { Capacitor, registerPlugin } from '@capacitor/core';

/** true jika berjalan sebagai aplikasi APK (bukan di browser). */
export const isNative = Capacitor.isNativePlatform();

export const PosPrinter = registerPlugin('PosPrinter');

export function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function textToBase64(text) {
  return bytesToBase64(new TextEncoder().encode(text));
}
