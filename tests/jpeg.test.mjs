// tests/jpeg.test.mjs
// Baseline-JPEG-Leser fuer Logos. Die Bilder sind erfundene Testmuster (vier
// einfarbige Quadranten), erzeugt mit libjpeg in verschiedenen Varianten.
import assert from "node:assert/strict";
import { test } from "node:test";
import { dekodiereJpeg, istJpeg } from "../app/tools/lib/jpeg.mjs";

// Quadranten: oben links rot, oben rechts gruen, unten links blau, unten rechts weiss.
const ROT = [220, 30, 40];
const GRUEN = [20, 160, 60];
const BLAU = [30, 60, 200];
const WEISS = [250, 250, 250];

const BILDER = {
  q444: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAgACADAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDxSvzc/vsKAOzqz/F8KAOMqD/aAKAOzqz/ABfCgDxSv9DT9gCgD96K/jc/RQoA/Bev7IPzoKAP3or+Nz9FCgD/2Q==",
  q420: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAgACADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDxSiiivzc/vs7OiiirP8XzxSiiiv8AQ0/YD96KKKK/jc/RT//Z",
  krumm: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAANABUDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDwb+27L/nt/wCON/hXvHwy/Z88f/EPwRpviDw/oH9oaReeb5Fz9st4t+yV0b5XkDDDKw5Hb0r5dr9bv2FP+TVvBH/b9/6XXFfacT8A5ZkmDhiMPUqNuSj7zi1ZqT6RXY6OI+K8d4gYSOV5pCEKcJKonTTTuk42fNKatab6XvbXv8t/8MkfFj/oVP8Ayo2n/wAdor9HqK/Mf7Jod3+H+R+c/wCpeX/zz++P/wAif//Z",
  grau: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAAgACABAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APFKK7OiuMors6K8Uor96KK/Beiv3oor/9k=",
  rst: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAgACADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/90ABAAB/9oADAMBAAIRAxEAPwDxSiiivzc/vs//0OHooor86P5aP//R+XKKKK/sg/Oj/9L9RaKKKAP/2Q==",
  prog: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wgARCAAgACADASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAYFCP/EABcBAAMBAAAAAAAAAAAAAAAAAAYHCAH/2gAMAwEAAhADEAAAAYkDb92hsXxIocw70CbI/wD/xAAUEAEAAAAAAAAAAAAAAAAAAABA/9oACAEBAAEFAgf/xAAUEQEAAAAAAAAAAAAAAAAAAAAg/9oACAEDAQE/AR//xAAUEQEAAAAAAAAAAAAAAAAAAAAg/9oACAECAQE/AR//xAAUEAEAAAAAAAAAAAAAAAAAAABA/9oACAEBAAY/Agf/xAAUEAEAAAAAAAAAAAAAAAAAAABA/9oACAEBAAE/IQf/2gAMAwEAAgADAAAAEPQ/fP/EABQRAQAAAAAAAAAAAAAAAAAAACD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAACD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAAED/2gAIAQEAAT8QB//Z",
};
const jpeg = (name) => Buffer.from(BILDER[name], "base64");

function pixel(bild, x, y) {
  const o = (y * bild.breite + x) * 4;
  return [...bild.rgba.subarray(o, o + 4)];
}

// Farbe in der Mitte jedes Quadranten, mit Toleranz fuer die Kompression.
function pruefeQuadranten(bild, farben, toleranz = 6) {
  const punkte = [
    [Math.floor(bild.breite / 4), Math.floor(bild.hoehe / 4)],
    [Math.floor((bild.breite * 3) / 4), Math.floor(bild.hoehe / 4)],
    [Math.floor(bild.breite / 4), Math.floor((bild.hoehe * 3) / 4)],
    [Math.floor((bild.breite * 3) / 4), Math.floor((bild.hoehe * 3) / 4)],
  ];
  punkte.forEach(([x, y], i) => {
    const [r, g, b, a] = pixel(bild, x, y);
    assert.equal(a, 255);
    [r, g, b].forEach((wert, k) => assert.ok(Math.abs(wert - farben[i][k]) <= toleranz, `Quadrant ${i} Kanal ${k}: ${wert} statt ${farben[i][k]}`));
  });
}

test("JPEG: Erkennung an der Signatur", () => {
  assert.equal(istJpeg(jpeg("q444")), true);
  assert.equal(istJpeg(Buffer.from([0x89, 0x50, 0x4e, 0x47])), false);
  assert.equal(istJpeg(Buffer.from("<svg/>")), false);
  assert.throws(() => dekodiereJpeg(Buffer.from("<svg/>")), /kein JPEG/);
});

test("JPEG: Farbe ohne und mit Unterabtastung (4:4:4, 4:2:0)", () => {
  for (const name of ["q444", "q420"]) {
    const bild = dekodiereJpeg(jpeg(name));
    assert.deepEqual([bild.breite, bild.hoehe, bild.rgba.length], [32, 32, 32 * 32 * 4]);
    pruefeQuadranten(bild, [ROT, GRUEN, BLAU, WEISS]);
  }
});

test("JPEG: Groesse, die kein Vielfaches der Blockgroesse ist", () => {
  const bild = dekodiereJpeg(jpeg("krumm"));
  assert.deepEqual([bild.breite, bild.hoehe], [21, 13]);
  pruefeQuadranten(bild, [ROT, GRUEN, BLAU, WEISS], 12);
});

test("JPEG: Graustufen", () => {
  const bild = dekodiereJpeg(jpeg("grau"));
  const grau = ([r, g, b]) => Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  pruefeQuadranten(bild, [ROT, GRUEN, BLAU, WEISS].map((f) => [grau(f), grau(f), grau(f)]));
  const [r, g, b] = pixel(bild, 3, 3);
  assert.ok(r === g && g === b);
});

test("JPEG: Restart-Marker nach jedem Block", () => {
  const roh = jpeg("rst");
  assert.ok(roh.includes(Buffer.from([0xff, 0xdd])), "Testbild enthaelt DRI");
  const bild = dekodiereJpeg(roh);
  pruefeQuadranten(bild, [ROT, GRUEN, BLAU, WEISS]);
  assert.deepEqual(bild.rgba, dekodiereJpeg(jpeg("q420")).rgba);
});

test("JPEG: progressiv und abgeschnitten werden abgelehnt", () => {
  assert.throws(() => dekodiereJpeg(jpeg("prog")), /progressiv/);
  const roh = jpeg("q444");
  assert.throws(() => dekodiereJpeg(roh.subarray(0, roh.length - 200)), /unvollstaendig|abgeschnitten/);
  assert.throws(() => dekodiereJpeg(roh.subarray(0, 40)), /abgeschnitten|ohne Bildkopf/);
});

test("JPEG: zu grosse Kante und doppelter Bildkopf werden abgelehnt", () => {
  const roh = jpeg("q444");
  const sof = roh.indexOf(Buffer.from([0xff, 0xc0]));
  const gross = Buffer.from(roh);
  gross.writeUInt16BE(4000, sof + 7);
  assert.throws(() => dekodiereJpeg(gross), /Groesse unzulaessig/);
  const laenge = roh.readUInt16BE(sof + 2);
  const kopf = roh.subarray(sof, sof + 2 + laenge);
  const doppelt = Buffer.concat([roh.subarray(0, sof), kopf, roh.subarray(sof)]);
  assert.throws(() => dekodiereJpeg(doppelt), /mehreren Bildkoepfen/);
});
